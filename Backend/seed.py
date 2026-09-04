import uuid
import bcrypt
from datetime import datetime, timezone, timedelta
from app import app, db, User, Ticket, TicketCollaborator, Reply, TicketEvent, SlaAlert

with app.app_context():
    db.create_all()

    # Clear existing tables
    SlaAlert.query.delete()
    TicketEvent.query.delete()
    Reply.query.delete()
    TicketCollaborator.query.delete()
    Ticket.query.delete()
    User.query.delete()
    db.session.commit()

    # Hash default password 'password'
    pw_hash = bcrypt.hashpw(b'password', bcrypt.gensalt(12)).decode('utf-8')

    # Seed users
    supervisor = User(id=str(uuid.uuid4()), name='Maya Chen', email='maya@queuewise.co', role='supervisor', password_hash=pw_hash)
    jordan = User(id=str(uuid.uuid4()), name='Jordan Lee', email='jordan@queuewise.co', role='agent', password_hash=pw_hash)
    sam = User(id=str(uuid.uuid4()), name='Sam Rivera', email='sam@queuewise.co', role='agent', password_hash=pw_hash)
    priya = User(id=str(uuid.uuid4()), name='Priya Shah', email='priya@queuewise.co', role='agent', password_hash=pw_hash)

    db.session.add_all([supervisor, jordan, sam, priya])
    db.session.commit()

    now = datetime.now(timezone.utc)
    ticket_specs = [
        ('SSO login loops back to sign in', 'Users cannot complete SSO login.', 'customer-a@example.com', 'Urgent', 'Technical', 'Open', sam.id, 3),
        ('Invoice is showing the wrong tax rate', 'The tax calculation differs from the invoice preview.', 'customer-b@example.com', 'High', 'Billing', 'Pending', jordan.id, 1),
        ('How do I export a report?', 'Please share the steps for exporting a monthly report.', 'customer-c@example.com', 'Normal', 'How-to', 'New', priya.id, 0),
        ('Data export missing two columns', 'The CSV export omits region and owner.', 'customer-d@example.com', 'Urgent', 'Technical', 'Open', jordan.id, 5),
        ('Close my old workspace', 'Please close the workspace created last year.', 'customer-e@example.com', 'Low', 'Account', 'Resolved', priya.id, 0),
        ('Password reset completed', 'Reset confirmation received.', 'customer-f@example.com', 'Normal', 'Account', 'Closed', sam.id, 10)
    ]

    for subject, description, requester, priority, category, status, assignee_id, age_hours in ticket_specs:
        created_at = now - timedelta(hours=age_hours)
        ticket = Ticket(
            id=str(uuid.uuid4()),
            subject=subject,
            description=description,
            requester=requester,
            priority=priority,
            category=category,
            status=status,
            primary_assignee_id=assignee_id,
            created_at=created_at,
            updated_at=created_at,
            closed_at=created_at if status == 'Closed' else None,
            pending_started_at=now - timedelta(hours=2) if status == 'Pending' else None,
            pending_seconds=3600 if status == 'Pending' else 0
        )
        db.session.add(ticket)
        db.session.commit()

        event = TicketEvent(
            id=str(uuid.uuid4()),
            ticket_id=ticket.id,
            type='status_change',
            actor_id=supervisor.id,
            new_value=status,
            created_at=created_at
        )
        db.session.add(event)

        reply = Reply(
            id=str(uuid.uuid4()),
            ticket_id=ticket.id,
            author_id=assignee_id,
            body='We are waiting for the requested details.' if status == 'Pending' else 'Thanks for contacting support. We are looking into this.',
            is_internal=False,
            created_at=created_at
        )
        db.session.add(reply)

        if 'tax' in subject.lower():
            collab = TicketCollaborator(ticket_id=ticket.id, user_id=priya.id, added_at=created_at)
            db.session.add(collab)

        db.session.commit()

    print('Seeded Queuewise demo data into PostgreSQL via Python. Login passwords are "password".')
