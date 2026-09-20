/** Admin overview and management API */
export function mountCoreB(app, deps) {
  const { query, withTransaction, authMiddleware, adminMiddleware, getProfile,
    createNotification, createAuditLog, buildAccountIdentity, signToken } = deps;

async function safeQuery(sql, params = [], fallbackRows = []) {
  try {
    return await query(sql, params);
  } catch (err) {
    console.warn('safeQuery:', err.message, sql.slice(0, 80));
    return { rows: fallbackRows };
  }
}

app.get('/api/admin/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [users, accounts, assets, recent, pending] = await Promise.all([
      safeQuery(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_locked) as locked FROM profiles`, [], [{ total: 0, locked: 0 }]),
      safeQuery(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_locked) as locked FROM accounts`, [], [{ total: 0, locked: 0 }]),
      safeQuery(`SELECT currency, COALESCE(SUM(balance),0) as total FROM accounts GROUP BY currency`),
      safeQuery(`SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 15`),
      safeQuery(`SELECT COUNT(*) as pending FROM account_requests WHERE status = 'pending'`, [], [{ pending: 0 }]),
    ]);
    res.json({
      users: users.rows[0] || { total: 0, locked: 0 },
      accounts: accounts.rows[0] || { total: 0, locked: 0 },
      assets_by_currency: assets.rows || [],
      recent_activity: recent.rows || [],
      pending_requests: parseInt(pending.rows[0]?.pending || 0),
    });
  } catch (err) {
    console.error(err);
    res.json({
      users: { total: 0, locked: 0 },
      accounts: { total: 0, locked: 0 },
      assets_by_currency: [],
      recent_activity: [],
      pending_requests: 0,
      degraded: true,
    });
  }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const search = req.query.q || '';
    const { rows } = await query(
      `SELECT id, email, full_name, role, is_locked, created_at, last_login, phone,
              (SELECT COUNT(*) FROM accounts a WHERE a.user_id = p.id) as account_count
       FROM profiles p WHERE email ILIKE $1 OR full_name ILIKE $1 ORDER BY created_at DESC LIMIT 100`,
      [`%${search}%`]
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('admin users:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch users' });
  }
});

app.patch('/api/admin/users/:id/lock', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { locked } = req.body;
    await query(`UPDATE profiles SET is_locked = $1 WHERE id = $2`, [!!locked, req.params.id]);
    try {
      const { emailAccountLock, voidEmail } = await import('../email.js');
      const contact = await query(`SELECT email, full_name FROM profiles WHERE id = $1`, [req.params.id]);
      const u = contact.rows[0];
      if (u?.email) {
        voidEmail(emailAccountLock({
          to: u.email,
          fullName: u.full_name,
          locked: !!locked,
          reason: req.body?.reason,
          scope: 'profile',
        }));
      }
    } catch (e) { console.warn('lock email', e.message); }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.get('/api/admin/accounts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const search = req.query.q || '';
    const { rows } = await query(
      `SELECT a.*, p.email, p.full_name FROM accounts a
       LEFT JOIN profiles p ON p.id = a.user_id
       WHERE COALESCE(a.account_number, '') ILIKE $1
          OR COALESCE(p.email, '') ILIKE $1
          OR COALESCE(p.full_name, '') ILIKE $1
       ORDER BY a.created_at DESC LIMIT 100`,
      [`%${search}%`]
    );
    res.json({ accounts: rows });
  } catch (err) {
    console.error('admin accounts:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch accounts' });
  }
});

app.patch('/api/admin/accounts/:id/lock', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { locked } = req.body;
    const acct = await query(`SELECT user_id FROM accounts WHERE id = $1`, [req.params.id]);
    await query(`UPDATE accounts SET is_locked = $1 WHERE id = $2`, [!!locked, req.params.id]);
    try {
      const { emailAccountLock, voidEmail } = await import('../email.js');
      const uid = acct.rows[0]?.user_id;
      if (uid) {
        const contact = await query(`SELECT email, full_name FROM profiles WHERE id = $1`, [uid]);
        const u = contact.rows[0];
        if (u?.email) {
          voidEmail(emailAccountLock({
            to: u.email,
            fullName: u.full_name,
            locked: !!locked,
            reason: req.body?.reason,
            scope: 'account',
          }));
        }
      }
    } catch (e) { console.warn('account lock email', e.message); }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update account' });
  }
});

app.post('/api/admin/accounts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let { user_id, email, currency, account_name, account_type, initial_deposit } = req.body || {};
    if (!['GBP', 'USD', 'EUR'].includes(currency)) {
      return res.status(400).json({ error: 'Valid currency required (GBP, USD, EUR)' });
    }
    if (!user_id && email) {
      const found = await query(`SELECT id FROM profiles WHERE email = $1`, [String(email).toLowerCase().trim()]);
      if (!found.rows.length) return res.status(404).json({ error: 'No customer with that email' });
      user_id = found.rows[0].id;
    }
    if (!user_id) {
      return res.status(400).json({ error: 'Customer email or user_id required' });
    }
    const existing = await query(`SELECT id FROM accounts WHERE user_id = $1 AND currency = $2`, [user_id, currency]);
    if (existing.rows.length) return res.status(409).json({ error: `Customer already has a ${currency} account` });
    const deposit = parseFloat(initial_deposit) || 0;
    const identity = await buildAccountIdentity({ currency, account_name, account_type });
    const result = await withTransaction(async (client) => {
      let account;
      try {
        const { rows } = await client.query(
          `INSERT INTO accounts (user_id, account_number, currency, account_name, account_type, routing_number, balance, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING *`,
          [user_id, identity.account_number, currency, identity.account_name, identity.account_type, identity.routing_number, deposit]
        );
        account = rows[0];
      } catch (_) {
        const { rows } = await client.query(
          `INSERT INTO accounts (user_id, account_number, currency, account_name, balance)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [user_id, identity.account_number, currency, identity.account_name, deposit]
        );
        account = rows[0];
      }
      if (deposit > 0) {
        try {
          await client.query(
            `INSERT INTO transactions (account_id, user_id, type, amount, currency, status, description, reference)
             VALUES ($1, $2, 'deposit', $3, $4, 'completed', 'Opening balance', $5)`,
            [account.id, user_id, deposit, currency, 'ADM-' + Math.random().toString(36).slice(2, 8).toUpperCase()]
          );
        } catch (_) {
          await client.query(
            `INSERT INTO transactions (account_id, type, amount, currency, status, description, reference)
             VALUES ($1, 'deposit', $2, $3, 'completed', 'Opening balance', $4)`,
            [account.id, deposit, currency, 'ADM-' + Math.random().toString(36).slice(2, 8).toUpperCase()]
          );
        }
      }
      return account;
    });
    res.status(201).json({ account: { ...result, account_number: result.account_number || identity.account_number } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to create account' });
  }
});

app.get('/api/admin/transactions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const search = req.query.q || '';
    const { rows } = await query(
      `SELECT t.*, a.account_number, p.email, p.full_name
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN profiles p ON p.id = COALESCE(t.user_id, a.user_id)
       WHERE t.reference ILIKE $1 OR p.email ILIKE $1 OR a.account_number ILIKE $1 OR t.description ILIKE $1
       ORDER BY t.created_at DESC LIMIT 150`,
      [`%${search}%`]
    );
    res.json({ transactions: rows });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch transactions' });
  }
});

app.patch('/api/admin/transactions/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { created_at, description, reference, amount } = req.body || {};
    if (!created_at && description === undefined && reference === undefined && amount === undefined) {
      return res.status(400).json({ error: 'Provide created_at, description, reference, and/or amount' });
    }
    const existing = await query(`SELECT * FROM transactions WHERE id = $1`, [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Transaction not found' });
    const before = existing.rows[0];
    const sets = [];
    const params = [];
    if (created_at) {
      const d = new Date(created_at);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid created_at datetime' });
      params.push(d.toISOString());
      sets.push(`created_at = $${params.length}`);
    }
    if (description !== undefined) { params.push(description); sets.push(`description = $${params.length}`); }
    if (reference !== undefined) { params.push(reference); sets.push(`reference = $${params.length}`); }
    if (amount !== undefined) {
      const amt = parseFloat(amount);
      if (!Number.isFinite(amt)) return res.status(400).json({ error: 'Invalid amount' });
      params.push(amt);
      sets.push(`amount = $${params.length}`);
    }
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE transactions SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    await createAuditLog(
      req.user?.id, 'edit_transaction', 'transaction', req.params.id,
      { created_at: before.created_at, description: before.description, reference: before.reference, amount: before.amount },
      { created_at: rows[0].created_at, description: rows[0].description, reference: rows[0].reference, amount: rows[0].amount },
      'Admin edited transaction', req.ip
    );
    res.json({ success: true, transaction: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to edit transaction' });
  }
});

app.get('/api/admin/activity', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 100`).catch(() => ({ rows: [] }));
    res.json({ activity: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

app.get('/api/admin/requests', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, p.email, p.full_name FROM account_requests r
       LEFT JOIN profiles p ON p.id = r.requester_id
       ORDER BY r.created_at DESC LIMIT 100`
    ).catch(() => ({ rows: [] }));
    res.json({ requests: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

app.post('/api/admin/requests/:id/review', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }
    const result = await withTransaction(async (client) => {
      const reqRes = await client.query(`SELECT * FROM account_requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (!reqRes.rows.length) throw new Error('Request not found');
      const request = reqRes.rows[0];
      if (request.status !== 'pending') throw new Error('Already reviewed');
      await client.query(`UPDATE account_requests SET status = $1 WHERE id = $2`, [status, req.params.id]);
      if (status === 'approved') {
        const identity = await buildAccountIdentity({ currency: request.currency, account_name: request.account_name });
        try {
          await client.query(
            `INSERT INTO accounts (user_id, account_number, currency, account_name, account_type, routing_number, balance, status)
             VALUES ($1, $2, $3, $4, $5, $6, 0, 'active')`,
            [request.requester_id, identity.account_number, request.currency, identity.account_name, identity.account_type, identity.routing_number]
          );
        } catch (_) {
          await client.query(
            `INSERT INTO accounts (user_id, account_number, currency, account_name, balance)
             VALUES ($1, $2, $3, $4, 0)`,
            [request.requester_id, identity.account_number, request.currency, identity.account_name]
          );
        }
      }
      return { status };
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Review failed' });
  }
});

}
