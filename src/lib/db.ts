import Database from 'better-sqlite3';
import path from 'path';

let db: any;
try {
  const dbPath = path.resolve(process.cwd(), 'qpms.db');
  console.log(`[DB] Opening database at ${dbPath}`);
  db = new Database(dbPath);
} catch (err) {
  console.error('[DB] Failed to open file database, falling back to in-memory:', err);
  db = new Database(':memory:');
}

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initDb() {
  // 1. USER
  db.exec(`
    CREATE TABLE IF NOT EXISTS USER (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone_no TEXT UNIQUE,
        dept TEXT NOT NULL,
        dob TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('COE', 'SETTER', 'REVIEWER')),
        wallet_balance REAL DEFAULT 0
    )
  `);

  // Ensure wallet_balance exists in USER
  try { db.exec('ALTER TABLE USER ADD COLUMN wallet_balance REAL DEFAULT 0'); } catch (e) { }

  // 2. SETTER
  db.exec(`
    CREATE TABLE IF NOT EXISTS SETTER (
        user_id INTEGER PRIMARY KEY,
        designation TEXT NOT NULL,
        experience INTEGER CHECK (experience >= 0),
        setter_rating REAL CHECK (setter_rating BETWEEN 0 AND 5),
        setter_subject TEXT,
        FOREIGN KEY (user_id) REFERENCES USER(user_id)
    )
  `);

  // 3. REVIEWER
  db.exec(`
    CREATE TABLE IF NOT EXISTS REVIEWER (
        user_id INTEGER PRIMARY KEY,
        reviewer_subject TEXT,
        reviewer_designation TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES USER(user_id)
    )
  `);

  // 4. COE
  db.exec(`
    CREATE TABLE IF NOT EXISTS COE (
        coe_code TEXT PRIMARY KEY,
        user_id INTEGER UNIQUE,
        FOREIGN KEY (user_id) REFERENCES USER(user_id)
    )
  `);

  // 5. ORDER
  db.exec(`
    CREATE TABLE IF NOT EXISTS "ORDER" (
        order_id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_date TEXT NOT NULL,
        deadline TEXT NOT NULL,
        instructions TEXT,
        blooms_taxo TEXT,
        status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Assigned','Completed','Approved')),
        payment REAL,
        payment_status TEXT DEFAULT 'Pending' CHECK (payment_status IN ('Pending','Cleared')),
        coe_code TEXT,
        FOREIGN KEY (coe_code) REFERENCES COE(coe_code)
    )
  `);

  // Ensure payment_status exists
  try { db.exec('ALTER TABLE "ORDER" ADD COLUMN payment_status TEXT DEFAULT "Pending"'); } catch (e) { }

  // 6. COURSE
  db.exec(`
    CREATE TABLE IF NOT EXISTS COURSE (
        course_id TEXT PRIMARY KEY,
        course_name TEXT NOT NULL,
        credits INTEGER CHECK (credits BETWEEN 1 AND 6),
        syllabus TEXT
    )
  `);

  // 7. SETTER_ALLOCATION
  db.exec(`
    CREATE TABLE IF NOT EXISTS SETTER_ALLOCATION (
        alloc_id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        setter_id INTEGER,
        course_id TEXT,
        submission_status TEXT DEFAULT 'Pending' CHECK (submission_status IN ('Pending','Accepted','Declined','Submitted','Reviewed','Rework','Rejected')),
        review_date TEXT,
        confidentiality_check INTEGER DEFAULT 0 CHECK (confidentiality_check IN (0,1)),
        appointment_letter_link TEXT,
        qp_template_link TEXT,
        syllabus_link TEXT,
        FOREIGN KEY (order_id) REFERENCES "ORDER"(order_id),
        FOREIGN KEY (setter_id) REFERENCES SETTER(user_id),
        FOREIGN KEY (course_id) REFERENCES COURSE(course_id)
    )
  `);

  // Ensure columns exist for existing databases
  try { db.exec('ALTER TABLE SETTER_ALLOCATION ADD COLUMN appointment_letter_link TEXT'); } catch (e) { }
  try { db.exec('ALTER TABLE SETTER_ALLOCATION ADD COLUMN qp_template_link TEXT'); } catch (e) { }
  try { db.exec('ALTER TABLE SETTER_ALLOCATION ADD COLUMN syllabus_link TEXT'); } catch (e) { }

  // 8. QUESTION_PAPER
  db.exec(`
    CREATE TABLE IF NOT EXISTS QUESTION_PAPER (
        qp_id INTEGER PRIMARY KEY AUTOINCREMENT,
        qp_subject TEXT,
        upload_date TEXT NOT NULL,
        total_marks INTEGER CHECK (total_marks BETWEEN 1 AND 100),
        link TEXT NOT NULL,
        approval_status TEXT DEFAULT 'Pending' CHECK (approval_status IN ('Pending','Approved','Rejected')),
        alloc_id INTEGER,
        course_id TEXT,
        FOREIGN KEY (alloc_id) REFERENCES SETTER_ALLOCATION(alloc_id),
        FOREIGN KEY (course_id) REFERENCES COURSE(course_id)
    )
  `);

  // 9. REVIEW
  db.exec(`
    CREATE TABLE IF NOT EXISTS REVIEW (
        review_id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_date TEXT NOT NULL,
        review_status TEXT DEFAULT 'Pending' CHECK (review_status IN ('Pending','Accepted','Rejected','Rework')),
        remarks TEXT,
        payment REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'Pending' CHECK (payment_status IN ('Pending','Cleared')),
        qp_id INTEGER,
        reviewer_id INTEGER,
        FOREIGN KEY (qp_id) REFERENCES QUESTION_PAPER(qp_id),
        FOREIGN KEY (reviewer_id) REFERENCES REVIEWER(user_id)
    )
  `);

  // Ensure columns exist for existing databases
  try { db.exec('ALTER TABLE REVIEW ADD COLUMN payment REAL DEFAULT 0'); } catch (e) { }
  try { db.exec('ALTER TABLE REVIEW ADD COLUMN payment_status TEXT DEFAULT "Pending"'); } catch (e) { }

  // Seed data if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM USER').get() as { count: number };
  if (userCount.count === 0) {
    // COE
    db.prepare(`INSERT INTO USER (first_name, last_name, email, password, phone_no, dept, dob, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'Admin', 'COE', 'coe@qpms.com', 'password', '1234567890', 'Exam Cell', '1980-01-01', 'COE'
    );
    db.prepare(`INSERT INTO COE (coe_code, user_id) VALUES (?, ?)`).run('COE001', 1);

    // Setter
    db.prepare(`INSERT INTO USER (first_name, last_name, email, password, phone_no, dept, dob, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'John', 'Setter', 'setter@qpms.com', 'password', '0987654321', 'Computer Science', '1985-05-15', 'SETTER'
    );
    db.prepare(`INSERT INTO SETTER (user_id, designation, experience, setter_rating, setter_subject) VALUES (?, ?, ?, ?, ?)`).run(
      2, 'Assistant Professor', 10, 4.5, 'Data Structures'
    );

    // Reviewer
    db.prepare(`INSERT INTO USER (first_name, last_name, email, password, phone_no, dept, dob, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'Alice', 'Reviewer', 'reviewer@qpms.com', 'password', '1122334455', 'Computer Science', '1982-10-20', 'REVIEWER'
    );
    db.prepare(`INSERT INTO REVIEWER (user_id, reviewer_subject, reviewer_designation) VALUES (?, ?, ?)`).run(
      3, 'Algorithms', 'Associate Professor'
    );

    // Courses
    db.prepare(`INSERT INTO COURSE (course_id, course_name, credits, syllabus) VALUES (?, ?, ?, ?)`).run(
      'CS101', 'Introduction to Programming', 4, 'Basics of C, Loops, Functions, Arrays'
    );
    db.prepare(`INSERT INTO COURSE (course_id, course_name, credits, syllabus) VALUES (?, ?, ?, ?)`).run(
      'CS201', 'Data Structures', 4, 'Stacks, Queues, Linked Lists, Trees'
    );
  }
}

export default db;
