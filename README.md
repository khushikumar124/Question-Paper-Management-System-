# QPMS – Question Paper Management System

A full-stack web application designed to simplify the management, organization, and storage of question papers for educational institutions.

---

## Features

- Upload and manage question papers
- Store papers securely using SQLite
- Clean and responsive user interface
- Full-stack TypeScript architecture
- File upload support
- Fast local database integration
- Modern React + Vite frontend

---

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- CSS

### Backend
- Node.js
- Express
- TypeScript

### Database
- SQLite (`better-sqlite3`)

---

## Project Structure

```bash
qpms/
│
├── src/
│   ├── lib/
│   │   └── db.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── uploads/
├── server.ts
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Installation

Clone the repository:

```bash
git clone https://github.com/khushikumar124/Question-Paper-Management-System-.git
```

Move into the project directory:

```bash
cd Question-Paper-Management-System-
```

Install dependencies:

```bash
npm install
```

---

## Running the Project

Start the development server:

```bash
npm run dev
```

The application will run locally on:

```bash
http://localhost:5173
```

---

## Environment Setup

Create a `.env` file if required.

Example:

```env
PORT=3000
```

---

## Future Improvements

- Authentication system
- Role-based access control
- Cloud database integration
- Search and filtering
- Admin dashboard enhancements
- Export/download functionality

---

## Author

Khushi Kumar

- GitHub: https://github.com/khushikumar124
- LinkedIn: https://linkedin.com/in/khushikumar68

---

## License

This project is for educational and learning purposes.