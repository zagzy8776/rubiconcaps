/** Customer accounts API */
export function mountCoreA(app, deps) {
  const { query, withTransaction, authMiddleware, adminMiddleware, getProfile,
    createNotification, createAuditLog, buildAccountIdentity, signToken } = deps;

app.get('/api/accounts', authMiddleware, async (req, res) => {
  try {
    const { ensurePrimaryAccount } = await import('../helpers.js');
    await ensurePrimaryAccount(req.user.id);

    let rows;
    try {
      rows = (await query(
        `SELECT id, account_number, account_name, account_type, routing_number, currency, balance, status, is_locked, created_at
         FROM accounts WHERE user_id = $1 ORDER BY created_at`,
        [req.user.id]
      )).rows;
    } catch (_) {
      rows = (await query(
        `SELECT id, account_number, account_name, currency, balance, status, is_locked, created_at
         FROM accounts WHERE user_id = $1 ORDER BY created_at`,
        [req.user.id]
      )).rows;
    }
    for (const row of rows) {
      if (!row.account_number) {
        try {
          const identity = await buildAccountIdentity({ currency: row.currency, account_name: row.account_name });
          await query(`UPDATE accounts SET account_number = $1 WHERE id = $2`, [identity.account_number, row.id]);
          row.account_number = identity.account_number;
          if (!row.routing_number) {
            await query(`UPDATE accounts SET routing_number = $1, account_type = COALESCE(account_type, 'current') WHERE id = $2`, [identity.routing_number, row.id]).catch(() => {});
            row.routing_number = identity.routing_number;
          }
        } catch (e) {
          console.warn('backfill account_number failed', row.id, e.message);
        }
      }
    }
    res.json({ accounts: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

app.post('/api/accounts', authMiddleware, async (req, res) => {
  try {
    const { currency, account_name, account_type } = req.body || {};
    if (!['GBP', 'USD', 'EUR'].includes(currency)) {
      return res.status(400).json({ error: 'Invalid currency. Choose GBP, USD, or EUR.' });
    }
    const existing = await query(`SELECT id FROM accounts WHERE user_id = $1 AND currency = $2`, [req.user.id, currency]);
    if (existing.rows.length) return res.status(409).json({ error: `You already have a ${currency} account` });

    const identity = await buildAccountIdentity({ currency, account_name, account_type });
    if (!identity.account_number) {
      return res.status(500).json({ error: 'Could not generate account number' });
    }

    let account;
    try {
      const { rows } = await query(
        `INSERT INTO accounts (user_id, account_number, currency, account_name, account_type, routing_number, balance, status)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 'active') RETURNING *`,
        [req.user.id, identity.account_number, currency, identity.account_name, identity.account_type, identity.routing_number]
      );
      account = rows[0];
    } catch (e1) {
      console.warn('full insert failed, minimal retry:', e1.message);
      const { rows } = await query(
        `INSERT INTO accounts (user_id, account_number, currency, account_name, balance)
         VALUES ($1, $2, $3, $4, 0) RETURNING *`,
        [req.user.id, identity.account_number, currency, identity.account_name]
      );
      account = rows[0];
      await query(
        `UPDATE accounts SET account_type = $1, routing_number = $2, status = 'active' WHERE id = $3`,
        [identity.account_type, identity.routing_number, account.id]
      ).catch(() => {});
    }

    if (!account.account_number) {
      account.account_number = identity.account_number;
      await query(`UPDATE accounts SET account_number = $1 WHERE id = $2`, [identity.account_number, account.id]).catch(() => {});
    }

    await query(
      `INSERT INTO activity_log (user_id, action, description, metadata) VALUES ($1, 'create_account', $2, $3)`,
      [req.user.id, `Created ${currency} account ${account.account_number}`, JSON.stringify({ account_id: account.id, account_number: account.account_number })]
    ).catch(() => {});

    res.status(201).json({
      account: {
        ...account,
        account_number: account.account_number || identity.account_number,
        account_type: account.account_type || identity.account_type,
        routing_number: account.routing_number || identity.routing_number,
        account_name: account.account_name || identity.account_name,
      },
    });
  } catch (err) {
    console.error('create account error:', err);
    res.status(500).json({ error: err.message || 'Failed to create account' });
  }
});

app.get('/api/accounts/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM accounts WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    const account = rows[0];
    if (!account.account_number) {
      const identity = await buildAccountIdentity({ currency: account.currency, account_name: account.account_name });
      await query(`UPDATE accounts SET account_number = $1 WHERE id = $2`, [identity.account_number, account.id]).catch(() => {});
      account.account_number = identity.account_number;
      account.routing_number = account.routing_number || identity.routing_number;
    }
    res.json({ account });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

app.get('/api/accounts/:id/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.account_id = $1 AND a.user_id = $2 ORDER BY t.created_at DESC LIMIT 100`,
      [req.params.id, req.user.id]
    );
    res.json({ transactions: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

}
