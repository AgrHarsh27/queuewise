import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Priority, Role, Status, EventType } from '@prisma/client';

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash('password', 12);
const users = [
    { name: 'Maya Chen', email: 'maya@queuewise.co', role: Role.supervisor },
    { name: 'Jordan Lee', email: 'jordan@queuewise.co', role: Role.agent },
    { name: 'Sam Rivera', email: 'sam@queuewise.co', role: Role.agent },
    { name: 'Priya Shah', email: 'priya@queuewise.co', role: Role.agent }
];

await prisma.slaAlert.deleteMany();
await prisma.ticketEvent.deleteMany();
await prisma.reply.deleteMany();
await prisma.ticketCollaborator.deleteMany();
await prisma.ticket.deleteMany();
await prisma.user.deleteMany();
const createdUsers = await Promise.all(users.map(user => prisma.user.create({ data: { ...user, passwordHash } })));
const [supervisor, jordan, sam, priya] = createdUsers;
const now = Date.now();
const ticketSpecs = [
    ['SSO login loops back to sign in', 'Users cannot complete SSO login.', 'customer-a@example.com', Priority.Urgent, 'Technical', Status.Open, sam.id, 3],
    ['Invoice is showing the wrong tax rate', 'The tax calculation differs from the invoice preview.', 'customer-b@example.com', Priority.High, 'Billing', Status.Pending, jordan.id, 1],
    ['How do I export a report?', 'Please share the steps for exporting a monthly report.', 'customer-c@example.com', Priority.Normal, 'How-to', Status.New, priya.id, 0],
    ['Data export missing two columns', 'The CSV export omits region and owner.', 'customer-d@example.com', Priority.Urgent, 'Technical', Status.Open, jordan.id, 5],
    ['Close my old workspace', 'Please close the workspace created last year.', 'customer-e@example.com', Priority.Low, 'Account', Status.Resolved, priya.id, 0],
    ['Password reset completed', 'Reset confirmation received.', 'customer-f@example.com', Priority.Normal, 'Account', Status.Closed, sam.id, 10]
] as const;
for (const [subject, description, requester, priority, category, status, assigneeId, ageHours] of ticketSpecs) {
    const createdAt = new Date(now - ageHours * 3600000);
    const ticket = await prisma.ticket.create({ data: { subject, description, requester, priority, category, status, primaryAssigneeId: assigneeId, createdAt, updatedAt: createdAt, closedAt: status === Status.Closed ? createdAt : undefined, pendingStartedAt: status === Status.Pending ? new Date(now - 2 * 3600000) : undefined, pendingSeconds: status === Status.Pending ? 3600 : 0 } });
    await prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: EventType.status_change, actorId: supervisor.id, newValue: status } });
    await prisma.reply.create({ data: { ticketId: ticket.id, authorId: assigneeId, body: status === Status.Pending ? 'We are waiting for the requested details.' : 'Thanks for contacting support. We are looking into this.', isInternal: false, createdAt } });
    if (subject.includes('tax')) await prisma.ticketCollaborator.create({ data: { ticketId: ticket.id, userId: priya.id } });
}
console.log('Seeded Queuewise demo data. Login passwords are "password".');
await prisma.$disconnect();
