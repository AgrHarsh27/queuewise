import os
import uuid
import csv
import io
from datetime import datetime, timezone, timedelta
from functools import wraps
from dotenv import load_dotenv

import jwt
import bcrypt
from flask import Flask, request, jsonify, make_response, g
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import or_, func, desc, asc

load_dotenv()

app = Flask(__name__)

# Database configuration
db_url = os.getenv('DATABASE_URL')
if not db_url:
    db_url = "postgresql://postgres:postgres@localhost:5432/queuewise"
else:
    # Render uses postgres:// but SQLAlchemy needs postgresql://
    if db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    if '?schema=' in db_url:
        db_url = db_url.split('?schema=')[0]
    elif '&schema=' in db_url:
        db_url = db_url.split('&schema=')[0]

app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Environment variables
JWT_SECRET = os.getenv('JWT_SECRET', 'super-secret')
PORT = int(os.getenv('PORT', 4000))
REOPEN_WINDOW_DAYS = int(os.getenv('REOPEN_WINDOW_DAYS', 7))
SLA_NEAR_BREACH_MINUTES = int(os.getenv('SLA_NEAR_BREACH_MINUTES', 60))

cors_origin = os.getenv('CORS_ORIGIN', 'http://localhost:5173,http://localhost:5174')
ALLOWED_ORIGINS = [o.strip() for o in cors_origin.split(',') if o.strip()]

def is_allowed_origin(origin):
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS or '*' in ALLOWED_ORIGINS:
        return True
    if origin.startswith('http://localhost:') or origin.startswith('http://127.0.0.1:'):
        return True
    return False

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin', '')
    if is_allowed_origin(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        response.headers['Access-Control-Expose-Headers'] = 'Content-Disposition'
    return response

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        response = make_response()
        origin = request.headers.get('Origin', '')
        if is_allowed_origin(origin):
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
            response.headers['Access-Control-Max-Age'] = '3600'
        return response, 200

# Helper datetime
def now_utc():
    return datetime.now(timezone.utc)

# Database Models
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='agent') # 'agent', 'supervisor'
    created_at = db.Column(db.DateTime(timezone=True), default=now_utc)

    def to_safe_dict(self):
        return {'id': self.id, 'name': self.name, 'email': self.email, 'role': self.role}

class Ticket(db.Model):
    __tablename__ = 'tickets'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subject = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text, nullable=False)
    requester = db.Column(db.Text, nullable=False)
    priority = db.Column(db.String(50), nullable=False, default='Normal') # Urgent, High, Normal, Low
    category = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(50), nullable=False, default='New') # New, Open, Pending, Resolved, Closed
    primary_assignee_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=now_utc)
    updated_at = db.Column(db.DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)
    closed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    pending_started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    pending_seconds = db.Column(db.Integer, nullable=False, default=0)

    primary_assignee = db.relationship('User', foreign_keys=[primary_assignee_id])
    collaborators = db.relationship('TicketCollaborator', backref='ticket', cascade='all, delete-orphan')
    replies = db.relationship('Reply', backref='ticket', cascade='all, delete-orphan', order_by='Reply.created_at.asc()')
    events = db.relationship('TicketEvent', backref='ticket', cascade='all, delete-orphan', order_by='TicketEvent.created_at.asc()')
    sla_alerts = db.relationship('SlaAlert', backref='ticket', cascade='all, delete-orphan', order_by='SlaAlert.breached_at.desc()')

class TicketCollaborator(db.Model):
    __tablename__ = 'ticket_collaborators'
    ticket_id = db.Column(db.String(36), db.ForeignKey('tickets.id', ondelete='CASCADE'), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    added_at = db.Column(db.DateTime(timezone=True), default=now_utc)
    user = db.relationship('User')

class Reply(db.Model):
    __tablename__ = 'replies'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id = db.Column(db.String(36), db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    author_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    body = db.Column(db.Text, nullable=False)
    is_internal = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=now_utc)
    author = db.relationship('User')

class TicketEvent(db.Model):
    __tablename__ = 'ticket_events'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id = db.Column(db.String(36), db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    type = db.Column(db.String(50), nullable=False) # status_change, reassignment, reply
    actor_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    old_value = db.Column(db.Text, nullable=True)
    new_value = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=now_utc)
    actor = db.relationship('User')

class SlaAlert(db.Model):
    __tablename__ = 'sla_alerts'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id = db.Column(db.String(36), db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    breached_at = db.Column(db.DateTime(timezone=True), nullable=False)
    acknowledged_at = db.Column(db.DateTime(timezone=True), nullable=True)
    acknowledged_by = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)
    acknowledger = db.relationship('User', foreign_keys=[acknowledged_by])

# SLA Priority Minutes Mapping
PRIORITY_MINUTES = {
    'Urgent': 60,
    'High': 240,
    'Normal': 480,
    'Low': 1440
}

# Transition rules
TRANSITIONS = {
    'New': ['Open'],
    'Open': ['Pending', 'Resolved'],
    'Pending': ['Open', 'Resolved'],
    'Resolved': ['Closed', 'Open'],
    'Closed': ['Open']
}

def elapsed_seconds(ticket):
    created_at = ticket.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
        
    if ticket.status == 'Pending' and ticket.pending_started_at:
        pending_started = ticket.pending_started_at
        if pending_started.tzinfo is None:
            pending_started = pending_started.replace(tzinfo=timezone.utc)
        end = pending_started
    else:
        end = now_utc()
        
    diff = int((end - created_at).total_seconds())
    return max(0, diff - (ticket.pending_seconds or 0))

def present_ticket(ticket):
    elapsed = elapsed_seconds(ticket)
    target = PRIORITY_MINUTES.get(ticket.priority, 480) * 60
    remaining = target - elapsed
    
    collaborators = [c.user.to_safe_dict() for c in ticket.collaborators if c.user]
    
    replies = [{
        'id': r.id,
        'ticketId': r.ticket_id,
        'authorId': r.author_id,
        'body': r.body,
        'isInternal': r.is_internal,
        'createdAt': r.created_at.isoformat() if r.created_at else None,
        'author': r.author.to_safe_dict() if r.author else None
    } for r in ticket.replies]
    
    events = [{
        'id': e.id,
        'ticketId': e.ticket_id,
        'type': e.type,
        'actorId': e.actor_id,
        'oldValue': e.old_value,
        'newValue': e.new_value,
        'createdAt': e.created_at.isoformat() if e.created_at else None,
        'actor': e.actor.to_safe_dict() if e.actor else None
    } for e in ticket.events]

    return {
        'id': ticket.id,
        'subject': ticket.subject,
        'description': ticket.description,
        'requester': ticket.requester,
        'priority': ticket.priority,
        'category': ticket.category,
        'status': ticket.status,
        'primaryAssigneeId': ticket.primary_assignee_id,
        'primaryAssignee': ticket.primary_assignee.to_safe_dict() if ticket.primary_assignee else None,
        'assignee': ticket.primary_assignee.to_safe_dict() if ticket.primary_assignee else None,
        'collaborators': collaborators,
        'replies': replies,
        'events': events,
        'createdAt': ticket.created_at.isoformat() if ticket.created_at else None,
        'updatedAt': ticket.updated_at.isoformat() if ticket.updated_at else None,
        'archivedAt': ticket.archived_at.isoformat() if ticket.archived_at else None,
        'closedAt': ticket.closed_at.isoformat() if ticket.closed_at else None,
        'sla': {
            'targetSeconds': target,
            'elapsedSeconds': elapsed,
            'remainingSeconds': remaining,
            'breached': remaining < 0,
            'pendingSeconds': ticket.pending_seconds or 0
        }
    }

def active_alert_info(ticket):
    elapsed = elapsed_seconds(ticket)
    target = PRIORITY_MINUTES.get(ticket.priority, 480) * 60
    remaining = target - elapsed
    severity = 'breaching' if remaining < 0 else 'at-risk'
    return remaining, severity

def sync_alerts():
    tickets = Ticket.query.filter(
        Ticket.archived_at.is_(None),
        Ticket.status.in_(['New', 'Open', 'Pending'])
    ).all()
    
    for t in tickets:
        remaining, _ = active_alert_info(t)
        if remaining <= SLA_NEAR_BREACH_MINUTES * 60:
            latest_alert = SlaAlert.query.filter_by(ticket_id=t.id).order_by(SlaAlert.breached_at.desc()).first()
            if not latest_alert or (latest_alert.acknowledged_at and latest_alert.acknowledged_at.replace(tzinfo=timezone.utc) < t.updated_at.replace(tzinfo=timezone.utc)):
                new_alert = SlaAlert(id=str(uuid.uuid4()), ticket_id=t.id, breached_at=now_utc())
                db.session.add(new_alert)
    db.session.commit()

# Authentication & Authorization Helpers
def protected_route(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': {'reason': 'Authentication required: provide a Bearer token.'}}), 403
        
        token = auth_header.split(' ')[1]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            g.user = payload
        except Exception:
            return jsonify({'error': {'reason': 'Authentication failed: the token is missing, expired, or invalid.'}}), 403
        return f(*args, **kwargs)
    return decorated

def supervisor_only(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if g.user.get('role') != 'supervisor':
            return jsonify({'error': {'reason': 'Supervisor role required for this action.'}}), 403
        return f(*args, **kwargs)
    return decorated

def can_act(user, ticket_id):
    if user.get('role') == 'supervisor':
        return True
    
    user_id = user.get('id')
    t = Ticket.query.filter_by(id=ticket_id).first()
    if not t:
        return False
    if t.primary_assignee_id == user_id:
        return True
    
    collab = TicketCollaborator.query.filter_by(ticket_id=ticket_id, user_id=user_id).first()
    return collab is not None

# Write status transition & event log helper
def write_status(ticket, next_status, actor_id):
    now = now_utc()
    pending_seconds = ticket.pending_seconds or 0
    pending_started_at = ticket.pending_started_at

    if next_status == 'Pending':
        pending_started_at = now
    
    if ticket.status == 'Pending' and next_status != 'Pending' and pending_started_at:
        p_start = pending_started_at
        if p_start.tzinfo is None:
            p_start = p_start.replace(tzinfo=timezone.utc)
        pending_seconds += int((now - p_start).total_seconds())
        pending_started_at = None

    old_status = ticket.status
    ticket.status = next_status
    ticket.pending_started_at = pending_started_at
    ticket.pending_seconds = pending_seconds
    ticket.updated_at = now
    
    if next_status == 'Closed':
        ticket.closed_at = now
    elif next_status == 'Open':
        ticket.closed_at = None

    event = TicketEvent(
        id=str(uuid.uuid4()),
        ticket_id=ticket.id,
        type='status_change',
        actor_id=actor_id,
        old_value=old_status,
        new_value=next_status,
        created_at=now
    )
    db.session.add(event)

# Routes

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'ok': True})

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': {'reason': 'Invalid request input.'}}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
        return jsonify({'error': {'reason': 'Invalid email or password.'}}), 401

    safe_user = user.to_safe_dict()
    token = jwt.encode({**safe_user, 'exp': datetime.now(timezone.utc) + timedelta(hours=8)}, JWT_SECRET, algorithm='HS256')
    return jsonify({'token': token, 'user': safe_user})

@app.route('/api/users', methods=['GET'])
@protected_route
def get_users():
    users = User.query.order_by(User.name.asc()).all()
    return jsonify([u.to_safe_dict() for u in users])

@app.route('/api/users', methods=['POST'])
@protected_route
@supervisor_only
def create_user():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    role = data.get('role', 'agent').strip().lower()

    if not name or not email or not password or role not in ['agent', 'supervisor']:
        return jsonify({'error': {'reason': 'Name, email, password, and valid role (agent or supervisor) are required.'}}), 400

    existing = User.query.filter_by(email=email).first()
    if existing:
        return jsonify({'error': {'reason': 'A user with this email address already exists.'}}), 400

    pw_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')
    u = User(
        id=str(uuid.uuid4()),
        name=name,
        email=email,
        password_hash=pw_hash,
        role=role
    )
    db.session.add(u)
    db.session.commit()
    return jsonify(u.to_safe_dict()), 201

@app.route('/api/tickets', methods=['GET'])
@protected_route
def get_tickets():
    q = request.args.get('q')
    status = request.args.get('status')
    priority = request.args.get('priority')
    category = request.args.get('category')
    assignee = request.args.get('assignee')
    sort = request.args.get('sort', 'created_at')
    direction = request.args.get('direction', 'desc')
    page = int(request.args.get('page', 1))
    page_size = min(int(request.args.get('pageSize', 20)), 100)
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'

    query = Ticket.query
    if not include_archived:
        query = query.filter(Ticket.archived_at.is_(None))
    if status:
        query = query.filter(Ticket.status == status)
    if priority:
        query = query.filter(Ticket.priority == priority)
    if category:
        query = query.filter(Ticket.category == category)
    if assignee:
        query = query.filter(Ticket.primary_assignee_id == assignee)
    if q:
        query = query.filter(or_(Ticket.subject.ilike(f'%{q}%'), Ticket.description.ilike(f'%{q}%')))

    # Sorting
    if sort == 'priority':
        order_col = Ticket.priority
    elif sort == 'updated_at':
        order_col = Ticket.updated_at
    else:
        order_col = Ticket.created_at

    if direction == 'asc':
        query = query.order_by(asc(order_col))
    else:
        query = query.order_by(desc(order_col))

    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    return jsonify({
        'results': [present_ticket(t) for t in rows],
        'total': total,
        'page': page,
        'pageSize': page_size
    })

@app.route('/api/tickets/mine', methods=['GET'])
@protected_route
def get_my_tickets():
    user_id = g.user['id']
    query = Ticket.query.outerjoin(TicketCollaborator).filter(
        Ticket.archived_at.is_(None),
        or_(Ticket.primary_assignee_id == user_id, TicketCollaborator.user_id == user_id)
    ).order_by(desc(Ticket.updated_at))
    
    tickets = query.all()
    return jsonify([present_ticket(t) for t in tickets])

@app.route('/api/tickets/<string:ticket_id>', methods=['GET'])
@protected_route
def get_ticket(ticket_id):
    t = Ticket.query.filter_by(id=ticket_id).first()
    if not t:
        return jsonify({'error': {'reason': 'Ticket not found.'}}), 404
    if not can_act(g.user, t.id) and g.user.get('role') != 'supervisor':
        return jsonify({'error': {'reason': 'You may only view tickets assigned to you or shared with you.'}}), 403
    return jsonify(present_ticket(t))

@app.route('/api/tickets', methods=['POST'])
@protected_route
def create_ticket():
    data = request.get_json() or {}
    subject = data.get('subject', '').strip()
    description = data.get('description', '').strip()
    requester = data.get('requester', '').strip()
    priority = data.get('priority')
    category = data.get('category', '').strip()
    primary_assignee_id = data.get('primaryAssigneeId')

    if not subject or not description or not requester or not priority or not category:
        return jsonify({'error': {'reason': 'Invalid request input.'}}), 400

    if primary_assignee_id and not User.query.filter_by(id=primary_assignee_id).first():
        return jsonify({'error': {'reason': 'primaryAssigneeId does not identify a user.'}}), 400

    t = Ticket(
        id=str(uuid.uuid4()),
        subject=subject,
        description=description,
        requester=requester,
        priority=priority,
        category=category,
        primary_assignee_id=primary_assignee_id
    )
    db.session.add(t)
    db.session.commit()
    return jsonify(present_ticket(t)), 201

@app.route('/api/tickets/<string:ticket_id>', methods=['PATCH'])
@protected_route
def update_ticket(ticket_id):
    t = Ticket.query.filter_by(id=ticket_id).first()
    if not t:
        return jsonify({'error': {'reason': 'Ticket not found.'}}), 404
    if not can_act(g.user, t.id):
        return jsonify({'error': {'reason': 'You may only edit tickets assigned to you or shared with you.'}}), 403

    data = request.get_json() or {}
    if 'subject' in data: t.subject = data['subject']
    if 'description' in data: t.description = data['description']
    if 'requester' in data: t.requester = data['requester']
    if 'priority' in data: t.priority = data['priority']
    if 'category' in data: t.category = data['category']

    t.updated_at = now_utc()
    db.session.commit()
    return jsonify(present_ticket(t))

@app.route('/api/tickets/<string:ticket_id>/status', methods=['POST'])
@protected_route
def change_status(ticket_id):
    t = Ticket.query.filter_by(id=ticket_id).first()
    if not t:
        return jsonify({'error': {'reason': 'Ticket not found.'}}), 404
    if not can_act(g.user, t.id):
        return jsonify({'error': {'reason': 'You may only change status on tickets assigned to you or shared with you.'}}), 403

    data = request.get_json() or {}
    next_status = data.get('status')
    if not next_status or next_status not in TRANSITIONS.get(t.status, []):
        return jsonify({'error': {'reason': f"Invalid status transition: {t.status} can move only to {', '.join(TRANSITIONS.get(t.status, []))}."}}), 400

    if t.status == 'Closed' and next_status == 'Open':
        if not t.closed_at or (now_utc() - t.closed_at.replace(tzinfo=timezone.utc)).total_seconds() > REOPEN_WINDOW_DAYS * 86400:
            return jsonify({'error': {'reason': f"Reopening is allowed only within {REOPEN_WINDOW_DAYS} days of closing."}}), 400

    write_status(t, next_status, g.user['id'])
    db.session.commit()
    return jsonify(present_ticket(t))

@app.route('/api/tickets/<string:ticket_id>/archive', methods=['POST'])
@protected_route
def archive_ticket(ticket_id):
    t = Ticket.query.filter_by(id=ticket_id).first()
    if not t:
        return jsonify({'error': {'reason': 'Ticket not found.'}}), 404
    if not can_act(g.user, t.id):
        return jsonify({'error': {'reason': 'You may only archive tickets assigned to you or shared with you.'}}), 403

    t.archived_at = now_utc()
    db.session.commit()
    return jsonify(present_ticket(t))

@app.route('/api/tickets/<string:ticket_id>/restore', methods=['POST'])
@protected_route
def restore_ticket(ticket_id):
    t = Ticket.query.filter_by(id=ticket_id).first()
    if not t:
        return jsonify({'error': {'reason': 'Ticket not found.'}}), 404
    if not can_act(g.user, t.id):
        return jsonify({'error': {'reason': 'You may only restore tickets assigned to you or shared with you.'}}), 403

    t.archived_at = None
    db.session.commit()
    return jsonify(present_ticket(t))

@app.route('/api/tickets/<string:ticket_id>/replies', methods=['GET'])
@protected_route
def get_replies(ticket_id):
    if not can_act(g.user, ticket_id):
        return jsonify({'error': {'reason': 'You may only view replies for tickets assigned to you or shared with you.'}}), 403
    replies = Reply.query.filter_by(ticket_id=ticket_id).order_by(Reply.created_at.asc()).all()
    return jsonify([{
        'id': r.id,
        'ticketId': r.ticket_id,
        'authorId': r.author_id,
        'body': r.body,
        'isInternal': r.is_internal,
        'createdAt': r.created_at.isoformat() if r.created_at else None,
        'author': r.author.to_safe_dict() if r.author else None
    } for r in replies])

@app.route('/api/tickets/<string:ticket_id>/replies', methods=['POST'])
@protected_route
def add_reply(ticket_id):
    t = Ticket.query.filter_by(id=ticket_id).first()
    if not t:
        return jsonify({'error': {'reason': 'Ticket not found.'}}), 404
    if not can_act(g.user, ticket_id):
        return jsonify({'error': {'reason': 'You may only reply to tickets assigned to you or shared with you.'}}), 403

    data = request.get_json() or {}
    body_text = data.get('body', '').strip()
    is_internal = bool(data.get('is_internal', False))

    if not body_text:
        return jsonify({'error': {'reason': 'Invalid request input.'}}), 400

    now = now_utc()
    reply = Reply(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        author_id=g.user['id'],
        body=body_text,
        is_internal=is_internal,
        created_at=now
    )
    db.session.add(reply)

    event = TicketEvent(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        type='reply',
        actor_id=g.user['id'],
        new_value='internal' if is_internal else 'public',
        created_at=now
    )
    db.session.add(event)

    if t.status == 'Pending' and not is_internal:
        write_status(t, 'Open', g.user['id'])
    else:
        t.updated_at = now

    db.session.commit()
    return jsonify({
        'id': reply.id,
        'ticketId': reply.ticket_id,
        'authorId': reply.author_id,
        'body': reply.body,
        'isInternal': reply.is_internal,
        'createdAt': reply.created_at.isoformat(),
        'author': reply.author.to_safe_dict()
    }), 201

@app.route('/api/tickets/<string:ticket_id>/collaborators', methods=['POST'])
@protected_route
def add_collaborator(ticket_id):
    if g.user.get('role') != 'supervisor' and not can_act(g.user, ticket_id):
        return jsonify({'error': {'reason': 'Only a supervisor or ticket participant may manage collaborators.'}}), 403
    
    data = request.get_json() or {}
    user_id = data.get('userId')
    if not user_id or not User.query.filter_by(id=user_id).first():
        return jsonify({'error': {'reason': 'Invalid user.'}}), 400

    existing = TicketCollaborator.query.filter_by(ticket_id=ticket_id, user_id=user_id).first()
    if not existing:
        collab = TicketCollaborator(ticket_id=ticket_id, user_id=user_id, added_at=now_utc())
        db.session.add(collab)
        db.session.commit()
        return jsonify({'ticketId': ticket_id, 'userId': user_id, 'user': collab.user.to_safe_dict()}), 201
    return jsonify({'ticketId': ticket_id, 'userId': user_id, 'user': existing.user.to_safe_dict()}), 200

@app.route('/api/tickets/<string:ticket_id>/collaborators/<string:user_id>', methods=['DELETE'])
@protected_route
def remove_collaborator(ticket_id, user_id):
    if g.user.get('role') != 'supervisor' and not can_act(g.user, ticket_id):
        return jsonify({'error': {'reason': 'Only a supervisor or ticket participant may manage collaborators.'}}), 403

    collab = TicketCollaborator.query.filter_by(ticket_id=ticket_id, user_id=user_id).first()
    if collab:
        db.session.delete(collab)
        db.session.commit()
    return '', 204

def reassign_ticket(ticket_id, assignee_id, actor):
    t = Ticket.query.filter_by(id=ticket_id).first()
    if not t:
        return {'success': False, 'reason': 'Ticket not found.'}
    if actor.get('role') != 'supervisor' and not can_act(actor, ticket_id):
        return {'success': False, 'reason': 'You may only reassign tickets assigned to you or shared with you.'}
    if actor.get('role') != 'supervisor' and t.primary_assignee_id == actor['id'] and assignee_id != actor['id']:
        return {'success': False, 'reason': 'Agents cannot reassign a ticket away from themselves.'}

    target_user = User.query.filter_by(id=assignee_id).first()
    if not target_user:
        return {'success': False, 'reason': 'Assignee not found.'}

    old_assignee = t.primary_assignee_id
    t.primary_assignee_id = assignee_id
    t.updated_at = now_utc()

    event = TicketEvent(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        type='reassignment',
        actor_id=actor['id'],
        old_value=old_assignee,
        new_value=assignee_id,
        created_at=now_utc()
    )
    db.session.add(event)
    db.session.commit()
    return {'success': True}

@app.route('/api/tickets/<string:ticket_id>/reassign', methods=['POST'])
@protected_route
@supervisor_only
def reassign_single(ticket_id):
    data = request.get_json() or {}
    assignee_id = data.get('assigneeId')
    res = reassign_ticket(ticket_id, assignee_id, g.user)
    if not res['success']:
        return jsonify({'error': {'reason': res['reason']}}), 400
    t = Ticket.query.filter_by(id=ticket_id).first()
    return jsonify(present_ticket(t))

@app.route('/api/tickets/bulk/reassign', methods=['POST'])
@protected_route
def bulk_reassign():
    data = request.get_json() or {}
    ticket_ids = data.get('ticketIds', [])
    assignee_id = data.get('assigneeId')

    results = []
    for tid in ticket_ids:
        res = reassign_ticket(tid, assignee_id, g.user)
        results.append({
            'ticketId': tid,
            'success': res['success'],
            'reason': res.get('reason')
        })
    return jsonify(results)

@app.route('/api/tickets/bulk/close', methods=['POST'])
@protected_route
def bulk_close():
    data = request.get_json() or {}
    ticket_ids = data.get('ticketIds', [])

    results = []
    for tid in ticket_ids:
        t = Ticket.query.filter_by(id=tid).first()
        if not t:
            results.append({'ticketId': tid, 'success': False, 'reason': 'Ticket not found.'})
            continue
        if not can_act(g.user, tid):
            results.append({'ticketId': tid, 'success': False, 'reason': 'You are not allowed to close this ticket.'})
            continue
        if t.status != 'Resolved':
            results.append({'ticketId': tid, 'success': False, 'reason': 'Only Resolved tickets can be closed.'})
            continue

        write_status(t, 'Closed', g.user['id'])
        results.append({'ticketId': tid, 'success': True})
    
    db.session.commit()
    return jsonify(results)

@app.route('/api/tickets/export', methods=['GET'])
@protected_route
def export_csv():
    q = request.args.get('q')
    status = request.args.get('status')
    priority = request.args.get('priority')
    category = request.args.get('category')
    assignee = request.args.get('assignee')
    sort = request.args.get('sort', 'created_at')
    direction = request.args.get('direction', 'desc')
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'

    query = Ticket.query
    if not include_archived: query = query.filter(Ticket.archived_at.is_(None))
    if status: query = query.filter(Ticket.status == status)
    if priority: query = query.filter(Ticket.priority == priority)
    if category: query = query.filter(Ticket.category == category)
    if assignee: query = query.filter(Ticket.primary_assignee_id == assignee)
    if q: query = query.filter(or_(Ticket.subject.ilike(f'%{q}%'), Ticket.description.ilike(f'%{q}%')))

    order_col = Ticket.priority if sort == 'priority' else Ticket.updated_at if sort == 'updated_at' else Ticket.created_at
    query = query.order_by(asc(order_col) if direction == 'asc' else desc(order_col))

    rows = query.all()

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow(['id', 'subject', 'requester', 'priority', 'category', 'status', 'assignee', 'created_at', 'updated_at'])

    for t in rows:
        writer.writerow([
            t.id,
            t.subject,
            t.requester,
            t.priority,
            t.category,
            t.status,
            t.primary_assignee.name if t.primary_assignee else '',
            t.created_at.isoformat() if t.created_at else '',
            t.updated_at.isoformat() if t.updated_at else ''
        ])

    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = 'attachment; filename="queuewise-tickets.csv"'
    return response

@app.route('/api/alerts', methods=['GET'])
@protected_route
def get_alerts():
    sync_alerts()
    rows = SlaAlert.query.filter(SlaAlert.acknowledged_at.is_(None)).order_by(SlaAlert.breached_at.asc()).all()
    results = []
    for a in rows:
        rem, sev = active_alert_info(a.ticket)
        results.append({
            'id': a.id,
            'ticketId': a.ticket_id,
            'subject': a.ticket.subject,
            'assignee': a.ticket.primary_assignee.name if a.ticket.primary_assignee else 'Unassigned',
            'assigneeId': a.ticket.primary_assignee_id,
            'minutes': int(round(rem / 60.0)),
            'severity': sev,
            'breachedAt': a.breached_at.isoformat() if a.breached_at else None
        })
    return jsonify(results)

@app.route('/api/alerts/count', methods=['GET'])
@protected_route
def get_alerts_count():
    sync_alerts()
    count = SlaAlert.query.filter(SlaAlert.acknowledged_at.is_(None)).count()
    return jsonify({'count': count})

@app.route('/api/alerts/<string:alert_id>/acknowledge', methods=['POST'])
@protected_route
def acknowledge_alert(alert_id):
    alert = SlaAlert.query.filter_by(id=alert_id).first()
    if not alert:
        return jsonify({'error': {'reason': 'SLA alert not found.'}}), 404
    if alert.ticket.primary_assignee_id != g.user['id']:
        return jsonify({'error': {'reason': 'Only the ticket primary assignee may acknowledge this alert.'}}), 403

    alert.acknowledged_at = now_utc()
    alert.acknowledged_by = g.user['id']
    db.session.commit()
    return jsonify({
        'id': alert.id,
        'ticketId': alert.ticket_id,
        'breachedAt': alert.breached_at.isoformat(),
        'acknowledgedAt': alert.acknowledged_at.isoformat(),
        'acknowledgedBy': alert.acknowledged_by
    })

@app.route('/api/dashboard/summary', methods=['GET'])
@protected_route
def dashboard_summary():
    sync_alerts()
    week_ago = now_utc() - timedelta(days=7)
    
    open_cnt = Ticket.query.filter_by(status='Open', archived_at=None).count()
    pending_cnt = Ticket.query.filter_by(status='Pending', archived_at=None).count()
    resolved_cnt = Ticket.query.filter(Ticket.status == 'Resolved', Ticket.archived_at.is_(None), Ticket.updated_at >= week_ago).count()
    breaching_cnt = SlaAlert.query.join(Ticket).filter(SlaAlert.acknowledged_at.is_(None), Ticket.archived_at.is_(None)).count()

    return jsonify({
        'open': open_cnt,
        'pending': pending_cnt,
        'resolvedThisWeek': resolved_cnt,
        'breaching': breaching_cnt
    })

@app.route('/api/dashboard/by-status', methods=['GET'])
@protected_route
def dashboard_by_status():
    results = db.session.query(Ticket.status, func.count(Ticket.id)).filter(Ticket.archived_at.is_(None)).group_by(Ticket.status).all()
    return jsonify([{'status': r[0], 'count': r[1]} for r in results])

@app.route('/api/dashboard/by-agent', methods=['GET'])
@protected_route
def dashboard_by_agent():
    results = db.session.query(Ticket.primary_assignee_id, func.count(Ticket.id)).filter(Ticket.archived_at.is_(None)).group_by(Ticket.primary_assignee_id).all()
    users = User.query.all()
    user_map = {u.id: u.name for u in users}
    
    return jsonify([{
        'agentId': r[0],
        'agent': user_map.get(r[0], 'Unassigned'),
        'count': r[1]
    } for r in results])

@app.route('/api/dashboard/resolved-per-week', methods=['GET'])
@protected_route
def dashboard_resolved_per_week():
    since = now_utc() - timedelta(days=56)
    events = TicketEvent.query.filter(
        TicketEvent.type == 'status_change',
        TicketEvent.new_value == 'Resolved',
        TicketEvent.created_at >= since
    ).all()

    result = []
    now = now_utc()
    for index in range(8):
        start = now - timedelta(days=(7 - index) * 7)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=7)
        
        cnt = sum(1 for e in events if e.created_at.replace(tzinfo=timezone.utc) >= start and e.created_at.replace(tzinfo=timezone.utc) < end)
        result.append({
            'weekStart': start.strftime('%Y-%m-%d'),
            'count': cnt
        })

    return jsonify(result)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    print(f"Queuewise Flask API listening on port {PORT}")
    app.run(host='0.0.0.0', port=PORT, debug=False)
