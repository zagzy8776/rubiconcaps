# Rubicon Capital

Professional multi-currency private banking platform (GBP / USD / EUR).

## Stack

- **Frontend**: React + TypeScript + Vite + Tailwind
- **Backend**: Node.js + Express + JWT
- **Database**: Neon PostgreSQL

## Features

- Multi-currency accounts (GBP, USD, EUR)
- Customer dashboard with balances, deposits, withdrawals, transfers
- Full Admin Control Centre:
  - Overview & assets by currency
  - User management (lock/unlock)
  - Account management (lock/unlock, create accounts)
  - Transaction monitoring
  - Account request approval queue
  - Complete activity / audit log
- Atomic transfers with full audit trail
- Role-based access (admin / user)

## Setup

1. Copy `.env.example` → `.env` and fill in your Neon `DATABASE_URL` + JWT_SECRET
2. Install dependencies:

```bash
npm install
cd server && npm install && cd ..
```

3. Run both frontend and backend:

```bash
# Terminal 1 - API
cd server && npm run dev

# Terminal 2 - Frontend
npm run dev
```

Open http://localhost:5173

## First Admin

1. Sign up normally through the UI
2. Call the promote endpoint (or run SQL):

```bash
curl -X POST http://localhost:4000/api/admin/promote \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Or in the database:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

## Security Notes

- Never commit `.env`
- Change `JWT_SECRET` in production
- All money movements use database transactions
- Locked accounts cannot transact
