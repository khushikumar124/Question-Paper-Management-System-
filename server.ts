import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import db, { initDb } from './src/lib/db';

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure Multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

process.on('uncaughtException', (err) => {
  console.error('[SERVER] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Unhandled Rejection at:', promise, 'reason:', reason);
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  initDb();

  app.use(cors());
  app.use(express.json());

  // Health Check
  app.get('/api/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
      res.status(500).json({ status: 'error', database: 'disconnected', error: String(err) });
    }
  });

  // Auth
  app.post('/api/login', (req, res) => {
    console.log(`[AUTH] Login attempt for: ${req.body?.email}`);
    const { email, password, workspace_id } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    try {
      let user = db.prepare('SELECT * FROM USER WHERE email = ? AND password = ?').get(email, password) as any;

      // If a specific Workspace ID is provided, try to find that specific user
      if (user && workspace_id) {
        const specificUser = db.prepare('SELECT * FROM USER WHERE user_id = ? AND role = ?').get(workspace_id, user.role) as any;
        if (specificUser) {
          user = specificUser;
          console.log(`[AUTH] Switched to specific ${user.role}: ${workspace_id}`);
        }
      }

      if (user) {
        console.log(`[AUTH] Login success: ${email}`);
        res.json({ success: true, user });
      } else {
        console.log(`[AUTH] Login failed: ${email}`);
        res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
    } catch (err) {
      console.error(`[AUTH] Database error:`, err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // COE: List all users for allocation
  app.get('/api/coe/users', (req, res) => {
    const setters = db.prepare('SELECT u.*, s.designation FROM USER u JOIN SETTER s ON u.user_id = s.user_id').all();
    const reviewers = db.prepare('SELECT u.*, r.reviewer_designation FROM USER u JOIN REVIEWER r ON u.user_id = r.user_id').all();
    const courses = db.prepare('SELECT * FROM COURSE').all();
    res.json({ setters, reviewers, courses });
  });

  // COE: Allocate Order
  app.post('/api/coe/allocate', upload.fields([
    { name: 'appointment_letter', maxCount: 1 },
    { name: 'qp_template', maxCount: 1 },
    { name: 'syllabus', maxCount: 1 }
  ]), (req, res) => {
    const { course_id, setter_id, deadline, instructions, payment, coe_id } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    console.log(`[COE] Allocating course ${course_id} to setter ${setter_id}`);

    const appointment_letter = files['appointment_letter']?.[0]?.filename || null;
    const qp_template = files['qp_template']?.[0]?.filename || null;
    const syllabus = files['syllabus']?.[0]?.filename || null;

    const orderDate = new Date().toISOString().split('T')[0];
    const coe = db.prepare('SELECT coe_code FROM COE WHERE user_id = ?').get(Number(coe_id)) as any;

    try {
      const result = db.transaction(() => {
        const order = db.prepare(`INSERT INTO "ORDER" (order_date, deadline, instructions, status, payment, coe_code) VALUES (?, ?, ?, ?, ?, ?)`).run(
          orderDate, deadline, instructions, 'Assigned', Number(payment), coe.coe_code
        );
        const orderId = order.lastInsertRowid;
        db.prepare(`INSERT INTO SETTER_ALLOCATION (order_id, setter_id, course_id, submission_status, appointment_letter_link, qp_template_link, syllabus_link) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
          orderId, Number(setter_id), course_id, 'Pending', appointment_letter, qp_template, syllabus
        );
        // Deduct from Treasury
        return orderId;
      })();

      res.json({ success: true, orderId: result });
    } catch (err) {
      console.error('[COE] Allocation error:', err);
      res.status(500).json({ success: false, message: 'Failed to allocate order' });
    }
  });

  // File Serving
  app.get('/api/files/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).json({ success: false, message: 'File not found' });
    }
  });

  // COE: Get Recent Allocations
  app.get('/api/coe/recent-allocations', (req, res) => {
    const allocations = db.prepare(`
      SELECT sa.*, o.deadline, c.course_name, u.first_name, u.last_name
      FROM SETTER_ALLOCATION sa
      JOIN "ORDER" o ON sa.order_id = o.order_id
      JOIN COURSE c ON sa.course_id = c.course_id
      JOIN USER u ON sa.setter_id = u.user_id
      ORDER BY sa.alloc_id DESC
      LIMIT 10
    `).all();
    res.json(allocations);
  });

  // COE: Assign Reviewer
  app.post('/api/coe/assign-reviewer', (req, res) => {
    const { qp_id, reviewer_id, payment } = req.body;
    const reviewDate = new Date().toISOString();
    db.prepare(`INSERT INTO REVIEW (review_date, review_status, qp_id, reviewer_id, payment, payment_status) VALUES (?, ?, ?, ?, ?, ?)`).run(
      reviewDate, 'Pending', qp_id, reviewer_id, payment || 0, 'Pending'
    );
    res.json({ success: true });
  });

  // COE: Get Payments
  app.get('/api/coe/payments', (req, res) => {
    // 1. Setter Payments (from ORDER table)
    const setterPayments = db.prepare(`
      SELECT o.order_id, o.payment, o.payment_status, sa.submission_status,sa.review_date, sa.setter_id, 
             qp.qp_id, qp.upload_date as submit_date, 'SETTER' as type, u.first_name || ' ' || u.last_name as name,
             (SELECT review_status FROM REVIEW WHERE qp_id = qp.qp_id ORDER BY review_id DESC LIMIT 1) as review_status
      FROM "ORDER" o
      JOIN SETTER_ALLOCATION sa ON o.order_id = sa.order_id
      JOIN USER u ON sa.setter_id = u.user_id
      LEFT JOIN QUESTION_PAPER qp ON sa.alloc_id = qp.alloc_id
      WHERE sa.submission_status IN ('Submitted', 'Reviewed')
      AND o.payment_status = 'Pending'
    `).all();

    // 2. Reviewer Payments (from REVIEW table)
    const reviewerPayments = db.prepare(`
SELECT r.review_id, r.payment, r.payment_status, r.review_status, r.reviewer_id, r.review_date,
r.review_date as submit_date, 'REVIEWER' as type, u.first_name || ' ' || u.last_name as name,
qp.qp_subject as subject
FROM REVIEW r
JOIN USER u ON r.reviewer_id = u.user_id
JOIN QUESTION_PAPER qp ON r.qp_id = qp.qp_id
WHERE r.review_status IN ('Accepted', 'Rework') -- Cleaned up: No 'Rejected'
AND r.payment_status = 'Pending'
AND r.payment > 0
`).all();
    res.json([...setterPayments, ...reviewerPayments]);
  });

  // COE: Clear Payment
  app.post('/api/coe/clear-payment', (req, res) => {
    const { id, recipient_id, amount, coe_id, type } = req.body;
    console.log(`[COE] Attempting to clear ${type} payment for ID ${id}`);

    try {
      db.transaction(() => {
        // 1. SAFETY CHECK: Verify work is actually finished before paying
        if (type === 'SETTER') {
          const orderStatus = db.prepare(`
          SELECT sa.submission_status 
          FROM SETTER_ALLOCATION sa 
          WHERE sa.order_id = ?
        `).get(id) as any;

          if (!orderStatus || orderStatus.submission_status !== 'Reviewed') {
            throw new Error("Validation Failed: Paper must be 'Reviewed' before payment.");
          }

          // Update Order Table
          db.prepare("UPDATE \"ORDER\" SET payment_status = 'Cleared' WHERE order_id = ?").run(id);

        } else if (type === 'REVIEWER') {
          const reviewStatus = db.prepare(`
          SELECT review_status FROM REVIEW WHERE review_id = ?
        `).get(id) as any;

          if (!reviewStatus || reviewStatus.review_status !== 'Accepted') {
            throw new Error("Validation Failed: Review must be 'Accepted' before payment.");
          }

          // Update Review Table
          db.prepare("UPDATE REVIEW SET payment_status = 'Cleared' WHERE review_id = ?").run(id);
        }

        // 2. THE MONEY MOVE (Atomic)
        // Add to Recipient
        db.prepare('UPDATE USER SET wallet_balance = wallet_balance + ? WHERE user_id = ?').run(amount, recipient_id);
        // Deduct from COE
        db.prepare('UPDATE USER SET wallet_balance = wallet_balance - ? WHERE user_id = ?').run(amount, coe_id);
      })();

      res.json({ success: true });
    } catch (err: any) {
      console.error('[COE] Payment clearing error:', err.message);
      // Use 400 for logic/validation errors, 500 for actual crashes
      res.status(400).json({ success: false, message: err.message || 'Failed to clear payment' });
    }
  });

  // COE: Add Funds
  app.post('/api/coe/add-funds', (req, res) => {
    const { userId, amount } = req.body;
    try {
      db.prepare('UPDATE USER SET wallet_balance = wallet_balance + ? WHERE user_id = ?').run(amount, userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  });

  // Setter: Get Allocations
  app.get('/api/setter/allocations/:userId', (req, res) => {
    const { userId } = req.params;
    const allocations = db.prepare(`
      SELECT sa.*, o.deadline, o.instructions, c.course_name, c.syllabus, r.remarks as reviewer_remarks
      FROM SETTER_ALLOCATION sa
      JOIN "ORDER" o ON sa.order_id = o.order_id
      JOIN COURSE c ON sa.course_id = c.course_id
      LEFT JOIN QUESTION_PAPER qp ON sa.alloc_id = qp.alloc_id
      LEFT JOIN REVIEW r ON qp.qp_id = r.qp_id
      WHERE sa.setter_id = ?
    `).all(Number(userId));
    res.json(allocations);
  });

  // Setter: Accept/Reject Allocation
  app.post('/api/setter/action', (req, res) => {
    const { alloc_id, action } = req.body; // action: 'Accepted' or 'Declined'
    try {
      db.prepare('UPDATE SETTER_ALLOCATION SET submission_status = ? WHERE alloc_id = ?').run(action, alloc_id);
      res.json({ success: true });
    } catch (err) {
      console.error('[SETTER] Action error:', err);
      res.status(500).json({ success: false });
    }
  });

  // Setter: Submit Paper
  app.post('/api/setter/submit', upload.single('paper_file'), (req, res) => {
    const { alloc_id, course_id, qp_subject, total_marks } = req.body;
    const file = req.file;
    const uploadDate = new Date().toISOString();
    const link = file ? file.filename : null;

    try {
      db.transaction(() => {
        const existingQP = db.prepare(`SELECT qp_id FROM QUESTION_PAPER WHERE alloc_id = ?`).get(alloc_id) as any;
        if (existingQP) {
          db.prepare(`UPDATE QUESTION_PAPER SET qp_subject = ?, upload_date = ?, total_marks = ?, link = ?, approval_status = 'Pending' WHERE qp_id = ?`).run(
            qp_subject, uploadDate, total_marks, link, existingQP.qp_id
          );
          // Reset review status if it was Rework
          db.prepare(`UPDATE REVIEW SET review_status = 'Pending', review_date = 'Pending', remarks = NULL WHERE qp_id = ?`).run(existingQP.qp_id);
        } else {
          // 1. Insert paper and capture the result to get the ID
          const result = db.prepare(`INSERT INTO QUESTION_PAPER (qp_subject, upload_date, total_marks, link, approval_status, alloc_id, course_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
            qp_subject, uploadDate, total_marks, link, 'Pending', alloc_id, course_id
          );

          const qpId = result.lastInsertRowid;

          // 2. Find the Reviewer assigned to this subject
          // This is the bridge. Without this, the Reviewer's dashboard sees nothing.
          const reviewer = db.prepare('SELECT user_id FROM REVIEWER WHERE reviewer_subject = ? LIMIT 1').get(qp_subject) as any;

          if (reviewer) {
            db.prepare(`INSERT INTO REVIEW (review_date, review_status, qp_id, reviewer_id) VALUES (?, ?, ?, ?)`).run(
              new Date().toISOString(), 'Pending', qpId, reviewer.user_id
            );
            console.log(`[SETTER] Bridge created: Paper ${qpId} assigned to Reviewer ${reviewer.user_id}`);
          } else {
            console.warn(`[SETTER] Warning: No reviewer found for subject: ${qp_subject}`);
          }
        }
        db.prepare(`UPDATE SETTER_ALLOCATION SET submission_status = 'Submitted' WHERE alloc_id = ?`).run(alloc_id);
      })();
      res.json({ success: true });
    } catch (err) {
      console.error('[SETTER] Submission error:', err);
      res.status(500).json({ success: false, message: 'Failed to submit paper' });
    }
  });

  // Wallet: Get Balance
  app.get('/api/wallet/:userId', (req, res) => {
    const { userId } = req.params;
    const wallet = db.prepare('SELECT wallet_balance FROM USER WHERE user_id = ?').get(Number(userId));
    res.json(wallet || { wallet_balance: 0 });
  });

  // Reviewer: Get Queue
  app.get('/api/reviewer/queue/:userId', (req, res) => {
    const { userId } = req.params;
    const queue = db.prepare(`
      SELECT r.*, qp.qp_subject, qp.link as qp_link, qp.total_marks, c.course_name, c.syllabus
      FROM REVIEW r
      JOIN QUESTION_PAPER qp ON r.qp_id = qp.qp_id
      JOIN COURSE c ON qp.course_id = c.course_id
      WHERE r.reviewer_id = ? AND r.review_status = 'Pending'
    `).all(Number(userId));
    res.json(queue);
  });

  // Reviewer: Action
  app.post('/api/reviewer/action', (req, res) => {
    const { review_id, status, remarks } = req.body;
    const reviewDate = new Date().toISOString(); // The Starting Gun 🔫

    try {
      db.transaction(() => {
        // 1. Update the Review table as usual
        db.prepare(`UPDATE REVIEW SET review_status = ?, remarks = ?, review_date = ? WHERE review_id = ?`)
          .run(status, remarks, reviewDate, review_id);

        const review = db.prepare(`
          SELECT qp.alloc_id 
          FROM REVIEW r 
          JOIN QUESTION_PAPER qp ON r.qp_id = qp.qp_id 
          WHERE r.review_id = ?
        `).get(review_id) as { alloc_id: number };

        if (status === 'Rework') {
          db.prepare(`UPDATE SETTER_ALLOCATION SET submission_status = 'Rework' WHERE alloc_id = ?`).run(review.alloc_id);
        } else if (status === 'Accepted') {
          // 2. SYNC THE TIMER: 
          // Update status AND set the review_date so the 24h timer starts NOW
          db.prepare(`
            UPDATE SETTER_ALLOCATION 
            SET submission_status = 'Reviewed', review_date = ? 
            WHERE alloc_id = ?
          `).run(reviewDate, review.alloc_id);
        }
      })();
      res.json({ success: true });
    } catch (err) {
      console.error('[REVIEWER] Action error:', err);
      res.status(500).json({ success: false });
    }
  });
  // --- VITE MIDDLEWARE ---

  if (process.env.NODE_ENV !== 'production') {
    console.log('[SERVER] Using Vite middleware (Development)');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[SERVER] Serving static files (Production)');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Final catch-all for debugging
  app.use((req, res) => {
    console.log(`[SERVER] Unmatched request: ${req.method} ${req.url}`);
    res.status(404).send('Not Found');
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Running on http://localhost:${PORT}`);
    console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

console.log('[SERVER] Starting...');
startServer().catch(err => {
  console.error('[SERVER] Failed to start:', err);
});
