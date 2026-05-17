import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, ClipboardList, UserCheck, CreditCard, Clock, FileText, CheckCircle, AlertCircle, Upload, Download, Wallet } from 'lucide-react';
import { format, differenceInHours, differenceInMinutes, parseISO, addHours, parse, isValid } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- UTILS ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- COMPONENTS ---

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden", className)}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', className, disabled }: any) => {
  const variants = {
    primary: "bg-black text-white hover:bg-gray-800",
    secondary: "bg-white text-black border border-gray-200 hover:bg-gray-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-green-600 text-white hover:bg-green-700"
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn("px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none", variants[variant as keyof typeof variants], className)}
    >
      {children}
    </button>
  );
};

const Timer = ({ deadline, label, type = 'deadline' }: { deadline: string; label: string; type?: 'deadline' | 'sla' }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!deadline || deadline === 'Pending') {
      setTimeLeft(deadline === 'Pending' ? 'Pending' : 'N/A');
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      let target: Date;

      try {
        const clean = deadline.trim();
        // 1. Convert SQLite space separator to ISO 'T'
        const isoFormat = clean.replace(' ', 'T');

        const datePart = isoFormat.substring(0, 10);
        const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);

        if (dateMatch && type === 'deadline') {
          const [, y, m, d] = dateMatch.map(Number);
          target = new Date(y, m - 1, d, 23, 59, 59, 999);
        } else {
          // 2. Parse using the fixed format
          const parsed = parseISO(isoFormat);
          target = isValid(parsed) ? parsed : new Date(isoFormat);
        }

        // 3. Apply the 24-hour SLA if needed
        if (type === 'sla') {
          target = addHours(target, 24);
        }

        const diff = target.getTime() - now.getTime();

        if (diff <= 0) {
          setTimeLeft('EXPIRED');
          setIsUrgent(true);
        } else {
          const h = Math.floor(diff / (1000 * 60 * 60));
          const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const s = Math.floor((diff % (1000 * 60)) / 1000);
          setTimeLeft(`${h}h ${m}m ${s}s`);
          setIsUrgent(h < 24);
        }
      } catch (err) {
        console.error("Timer Error:", err);
        setTimeLeft('ERROR');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline, type]); return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-mono", isUrgent ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
      <Clock size={14} />
      <span>{label}: {timeLeft}</span>
    </div>
  );
};

const WalletCard = ({ balance, onAddFunds, onWithdraw, onSettings, role }: { balance: number, onAddFunds?: () => void, onWithdraw?: () => void, onSettings?: () => void, role: string }) => {
  return (
    <Card className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none shadow-xl">
      <div className="flex justify-between items-start mb-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Wallet size={20} />
          {role === 'COE' ? 'University Treasury' : 'My Wallet'}
        </h2>
        <div className="p-2 bg-white/10 rounded-lg">
          <CreditCard size={20} />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase text-white/60">Available Balance</p>
        <p className="text-4xl font-bold">₹{balance.toLocaleString()}</p>
      </div>
      <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
        {onAddFunds && (
          <button
            onClick={onAddFunds}
            className="w-full py-2 bg-white text-indigo-700 rounded-lg font-bold text-sm hover:bg-white/90 transition-colors"
          >
            Add Funds (Top-up)
          </button>
        )}
        {onWithdraw && (
          <button
            onClick={onWithdraw}
            className="w-full py-2 bg-white text-indigo-700 rounded-lg font-bold text-sm hover:bg-white/90 transition-colors"
          >
            Withdraw Funds
          </button>
        )}
        <button
          onClick={onSettings}
          className="w-full py-2 bg-white/10 text-white rounded-lg font-bold text-sm hover:bg-white/20 transition-colors border border-white/20"
        >
          {role === 'COE' ? 'Payment Settings' : 'Connect Account (PayPal/GPay)'}
        </button>
      </div>
    </Card>
  );
};

// --- DASHBOARDS ---

const COEDashboard = ({ user, onLogout }: any) => {
  const [setters, setSetters] = useState([]);
  const [reviewers, setReviewers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [recentAllocations, setRecentAllocations] = useState([]);
  const [wallet, setWallet] = useState({ wallet_balance: 0 });
  const [formData, setFormData] = useState({
    course_id: '',
    setter_id: '',
    deadline: '',
    instructions: '',
    payment: 500,
    appointment_letter: null as File | null,
    qp_template: null as File | null,
    syllabus: null as File | null
  });
  const [successMessage, setSuccessMessage] = useState('');
  const [isAllocating, setIsAllocating] = useState(false);
  const [filter, setFilter] = useState('All');
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenAllocations, setHiddenAllocations] = useState<number[]>([]);

  const fetchData = () => {
    fetch('/api/coe/users').then(res => res.json()).then(data => {
      setSetters(data.setters);
      setReviewers(data.reviewers);
      setCourses(data.courses);
    });
    fetch('/api/coe/payments').then(res => res.json()).then(setPayments);
    fetch('/api/coe/recent-allocations').then(res => res.json()).then(setRecentAllocations);
    fetch(`/api/wallet/${user.user_id}`).then(res => res.json()).then(setWallet);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const [isAddingFunds, setIsAddingFunds] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('5000');

  const handleAddFunds = async () => {
    const amount = Number(topUpAmount);
    if (isNaN(amount) || amount <= 0) return alert('Please enter a valid amount.');

    try {
      const res = await fetch('/api/coe/add-funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id, amount })
      });
      if (res.ok) {
        setSuccessMessage(`₹${amount} added to University Treasury via Simulated Gateway.`);
        setIsAddingFunds(false);
        fetchData();
      }
    } catch (err) {
      console.error('Add funds error:', err);
    }
  };

  const handleAllocate = async (e: any) => {
    e.preventDefault();
    setSuccessMessage('');
    setIsAllocating(true);

    try {
      // Compare dates without time components
      const deadlineDate = new Date(formData.deadline + 'T00:00:00');
      const minDeadline = new Date();
      minDeadline.setHours(0, 0, 0, 0);
      minDeadline.setDate(minDeadline.getDate() + 3);

      if (deadlineDate < minDeadline) {
        setIsAllocating(false);
        return alert('Minimum deadline must be at least 3 days from today.');
      }

      if (wallet.wallet_balance < formData.payment) {
        setIsAllocating(false);
        return alert('Insufficient funds in Treasury to allocate this order.');
      }

      const formDataObj = new FormData();
      formDataObj.append('course_id', formData.course_id);
      formDataObj.append('setter_id', formData.setter_id);
      formDataObj.append('deadline', formData.deadline);
      formDataObj.append('instructions', formData.instructions);
      formDataObj.append('payment', formData.payment.toString());
      formDataObj.append('coe_id', user.user_id.toString());
      if (formData.appointment_letter) formDataObj.append('appointment_letter', formData.appointment_letter);
      if (formData.qp_template) formDataObj.append('qp_template', formData.qp_template);
      if (formData.syllabus) formDataObj.append('syllabus', formData.syllabus);

      const res = await fetch('/api/coe/allocate', {
        method: 'POST',
        body: formDataObj
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage('Allocation Successful! Files uploaded and resources bundled.');
        setFormData({
          course_id: '',
          setter_id: '',
          deadline: '',
          instructions: '',
          payment: 500,
          appointment_letter: null,
          qp_template: null,
          syllabus: null
        });
        // Refresh all data
        fetchData();
      } else {
        alert(data.message || 'Allocation failed');
      }
    } catch (err) {
      console.error('Allocation error:', err);
      alert('Network error during allocation');
    } finally {
      setIsAllocating(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">COE Dashboard</h1>
          <p className="text-gray-500">Controller of Examinations • {user.first_name} {user.last_name}</p>
        </div>
        <Button onClick={onLogout} variant="secondary"><LogOut size={18} className="mr-2 inline" /> Logout</Button>
      </header>

      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-green-100 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <CheckCircle size={20} />
              <p className="font-medium">{successMessage}</p>
            </div>
            <button onClick={() => setSuccessMessage('')} className="text-green-700 hover:text-green-900">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <WalletCard
            balance={wallet.wallet_balance}
            role="COE"
            onAddFunds={() => setIsAddingFunds(!isAddingFunds)}
            onSettings={() => setSuccessMessage('Payment settings are currently managed by the University Finance Portal.')}
          />

          <AnimatePresence>
            {isAddingFunds && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold uppercase text-blue-600">Top-up Amount (₹)</label>
                      <input
                        type="number"
                        value={topUpAmount}
                        onChange={e => setTopUpAmount(e.target.value)}
                        className="w-full p-2 border rounded-lg mt-1"
                      />
                    </div>
                    <Button onClick={handleAddFunds} className="mt-5">Confirm Top-up</Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Allocation Form */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2"><ClipboardList size={20} /> Order Allocation</h2>
            <form onSubmit={handleAllocate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-gray-500">Course</label>
                  <select
                    className="w-full p-2 border rounded-lg"
                    value={formData.course_id}
                    onChange={e => setFormData({ ...formData, course_id: e.target.value })}
                    required
                  >
                    <option value="">Select Course</option>
                    {courses.map((c: any) => <option key={c.course_id} value={c.course_id}>{c.course_name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-gray-500">Setter</label>
                  <select
                    className="w-full p-2 border rounded-lg"
                    value={formData.setter_id}
                    onChange={e => setFormData({ ...formData, setter_id: e.target.value })}
                    required
                  >
                    <option value="">Select Setter</option>
                    {setters.map((s: any) => <option key={s.user_id} value={s.user_id}>{s.first_name} {s.last_name} ({s.designation})</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-gray-500">Deadline</label>
                  <input
                    type="date"
                    className="w-full p-2 border rounded-lg"
                    value={formData.deadline}
                    min={new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-gray-500">Payment (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2 border rounded-lg"
                    value={formData.payment}
                    onChange={e => setFormData({ ...formData, payment: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs font-bold uppercase text-gray-400">Resource Bundle (Upload PDFs)</p>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-gray-400">Appointment Letter</label>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        id="file-letter"
                        onChange={e => setFormData({ ...formData, appointment_letter: e.target.files?.[0] || null })}
                      />
                      <label htmlFor="file-letter" className="flex items-center justify-between w-full p-2 text-sm border rounded-lg bg-white cursor-pointer hover:border-black transition-colors">
                        <span className="truncate">{formData.appointment_letter?.name || 'Select Appointment Letter...'}</span>
                        <Upload size={14} className="text-gray-400" />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-gray-400">QP Template</label>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        id="file-template"
                        onChange={e => setFormData({ ...formData, qp_template: e.target.files?.[0] || null })}
                      />
                      <label htmlFor="file-template" className="flex items-center justify-between w-full p-2 text-sm border rounded-lg bg-white cursor-pointer hover:border-black transition-colors">
                        <span className="truncate">{formData.qp_template?.name || 'Select QP Template...'}</span>
                        <Upload size={14} className="text-gray-400" />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-gray-400">Syllabus</label>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        id="file-syllabus"
                        onChange={e => setFormData({ ...formData, syllabus: e.target.files?.[0] || null })}
                      />
                      <label htmlFor="file-syllabus" className="flex items-center justify-between w-full p-2 text-sm border rounded-lg bg-white cursor-pointer hover:border-black transition-colors">
                        <span className="truncate">{formData.syllabus?.name || 'Select Syllabus...'}</span>
                        <Upload size={14} className="text-gray-400" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-500">Instructions</label>
                <textarea
                  className="w-full p-2 border rounded-lg h-24"
                  value={formData.instructions}
                  onChange={e => setFormData({ ...formData, instructions: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isAllocating}>
                {isAllocating ? 'Allocating Resources...' : 'Assign & Bundle Resources'}
              </Button>
            </form>
          </Card>
        </div>

        {/* Payment SLA Tracker */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-red-600"><CreditCard size={20} /> Payment SLA Tracker (24h)</h2>
          <div className="space-y-4">
            {payments.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <AlertCircle size={48} className="mx-auto mb-2 opacity-20" />
                <p>No pending payments</p>
              </div>
            ) : (
              payments.map((p: any) => (
                <div key={`${p.type}-${p.order_id || p.review_id}`} className="p-4 border rounded-xl flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold">{p.type === 'SETTER' ? `Order #${p.order_id}` : `Review: ${p.subject}`}</p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wider">{p.type}</span>
                    </div>
                    <p className="text-sm text-gray-500">Payee: {p.name}</p>
                    <p className="text-sm font-semibold text-indigo-600">Amount: ₹{p.payment}</p>
                    <p className="text-xs text-blue-600 font-medium mt-1 uppercase">Status: {p.review_status || p.submission_status}</p>
                  </div>
                  <Timer
                    deadline={p.review_date}
                    label="SLA"
                    type="sla"
                  />
                  <Button
                    variant="success"
                    className="text-xs"
                    // Disable the button if requirements aren't met
                    disabled={
                      (p.type === 'SETTER' && p.submission_status !== 'Reviewed') ||
                      (p.type === 'REVIEWER' && p.review_status !== 'Accepted')
                    }
                    onClick={async () => {
                      // 1. Double-check balance
                      if (wallet.wallet_balance < p.payment) {
                        return alert('Insufficient Treasury funds to clear this payment.');
                      }

                      // 2. Trigger the backend
                      const res = await fetch('/api/coe/clear-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          id: p.type === 'SETTER' ? p.order_id : p.review_id,
                          recipient_id: p.type === 'SETTER' ? p.setter_id : p.reviewer_id,
                          amount: p.payment,
                          coe_id: user.user_id,
                          type: p.type
                        })
                      });

                      if (res.ok) {
                        setSuccessMessage(`Payment of ₹${p.payment} cleared for ${p.type} (${p.name})`);
                        fetchData();
                      } else {
                        const data = await res.json();
                        alert(data.message || 'Payment failed. Ensure work is approved.');
                      }
                    }}
                  >
                    Clear Payment
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Recent Allocations Section */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2"><ClipboardList size={20} /> Recent Allocations</h2>
          <div className="flex gap-2">
            <select
              className="text-xs border rounded p-1"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="All">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Accepted">Accepted</option>
              <option value="Submitted">Submitted</option>
              <option value="Reviewed">Reviewed</option>
            </select>
            <Button
              variant="secondary"
              className="text-[10px] px-2 py-1"
              onClick={() => setShowHidden(!showHidden)}
            >
              {showHidden ? 'Hide Archived' : 'Show All'}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-xs font-bold uppercase text-gray-400">
                <th className="pb-3 px-2">Course</th>
                <th className="pb-3 px-2">Setter</th>
                <th className="pb-3 px-2">Deadline</th>
                <th className="pb-3 px-2">Status</th>
                <th className="pb-3 px-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentAllocations.filter((a: any) => {
                const matchesFilter = filter === 'All' || a.submission_status === filter;
                const isHidden = hiddenAllocations.includes(a.alloc_id);
                return matchesFilter && (showHidden || !isHidden);
              }).length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400">No matching allocations</td></tr>
              ) : (
                recentAllocations.filter((a: any) => {
                  const matchesFilter = filter === 'All' || a.submission_status === filter;
                  const isHidden = hiddenAllocations.includes(a.alloc_id);
                  return matchesFilter && (showHidden || !isHidden);
                }).map((a: any) => (
                  <tr key={a.alloc_id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-2">
                      <p className="font-bold">{a.course_name}</p>
                      <p className="text-xs text-gray-500">{a.course_id}</p>
                    </td>
                    <td className="py-4 px-2">
                      <p className="font-medium">{a.first_name} {a.last_name}</p>
                    </td>
                    <td className="py-4 px-2 text-sm">
                      {a.deadline}
                    </td>
                    <td className="py-4 px-2">
                      <span className={cn("px-2 py-1 rounded-full text-xs font-medium",
                        a.submission_status === 'Pending' ? "bg-yellow-100 text-yellow-700" :
                          a.submission_status === 'Rejected' ? "bg-red-100 text-red-700" :
                            "bg-green-100 text-green-700"
                      )}>
                        {a.submission_status}
                      </span>
                    </td>
                    <td className="py-4 px-2">
                      <button
                        onClick={() => {
                          if (hiddenAllocations.includes(a.alloc_id)) {
                            setHiddenAllocations(hiddenAllocations.filter(id => id !== a.alloc_id));
                          } else {
                            setHiddenAllocations([...hiddenAllocations, a.alloc_id]);
                          }
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {hiddenAllocations.includes(a.alloc_id) ? 'Restore' : 'Archive'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Reviewer Assignment Section */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2"><UserCheck size={20} /> Reviewer Assignment</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-xs font-bold uppercase text-gray-400">
                <th className="pb-3 px-2">Paper Subject</th>
                <th className="pb-3 px-2">Setter Status</th>
                <th className="pb-3 px-2">Assign Reviewer & Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.filter((p: any) => p.type === 'SETTER' && p.submission_status === 'Submitted' && (!p.review_status)).length === 0 ? (
                <tr><td colSpan={3} className="py-8 text-center text-gray-400">No papers awaiting reviewer assignment</td></tr>
              ) : (
                payments.filter((p: any) => p.type === 'SETTER' && p.submission_status === 'Submitted' && (!p.review_status || p.review_status === 'Rejected')).map((p: any) => (
                  <tr key={p.qp_id}>
                    <td className="py-4 px-2 font-medium">Order #{p.order_id} - Draft Submitted</td>
                    <td className="py-4 px-2"><span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs">Submitted</span></td>
                    <td className="py-4 px-2">
                      <div className="flex gap-2 items-center">
                        <select id={`rev-${p.qp_id}`} className="p-1 border rounded text-sm">
                          <option value="">Select Reviewer</option>
                          {reviewers.map((r: any) => (
                            <option key={r.user_id} value={r.user_id}>{r.first_name} {r.last_name}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1 border rounded p-1">
                          <span className="text-xs text-gray-400">₹</span>
                          <input id={`pay-${p.qp_id}`} type="number" defaultValue="200" className="w-16 text-sm outline-none" />
                        </div>
                        <Button className="text-xs" onClick={async () => {
                          const revId = (document.getElementById(`rev-${p.qp_id}`) as HTMLSelectElement).value;
                          const payment = (document.getElementById(`pay-${p.qp_id}`) as HTMLInputElement).value;
                          if (!revId) return alert('Select a reviewer');
                          await fetch('/api/coe/assign-reviewer', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ qp_id: p.qp_id, reviewer_id: revId, payment: Number(payment) })
                          });
                          setSuccessMessage('Reviewer Assigned with payment allocation!');
                          fetchData();
                        }}>Assign</Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const SetterDashboard = ({ user, onLogout }: any) => {
  const [allocations, setAllocations] = useState([]);
  const [selectedAlloc, setSelectedAlloc] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAllocating, setIsAllocating] = useState(false);
  const [wallet, setWallet] = useState({ wallet_balance: 0 });
  const [successMessage, setSuccessMessage] = useState('');
  const [filter, setFilter] = useState('All');
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenAllocations, setHiddenAllocations] = useState<number[]>([]);

  const fetchAllocations = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/setter/allocations/${user.user_id}`);
      const data = await res.json();
      setAllocations(data);

      const wRes = await fetch(`/api/wallet/${user.user_id}`);
      const wData = await wRes.json();
      setWallet(wData);
    } catch (err) {
      console.error('Error fetching allocations:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllocations();
  }, [user.user_id]);

  const handleSetterAction = async (alloc_id: number, action: 'Accepted' | 'Declined') => {
    try {
      const res = await fetch('/api/setter/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alloc_id, action })
      });
      if (res.ok) {
        setSuccessMessage(`Allocation ${action === 'Accepted' ? 'Accepted' : 'Declined'}`);
        fetchAllocations();
        if (action === 'Declined') setSelectedAlloc(null);
      }
    } catch (err) {
      console.error('Action error:', err);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const form = e.target;
    const fileInput = form.querySelector('input[type="file"]');
    const file = fileInput?.files?.[0];

    if (!file) return alert('Please select a file to submit');

    const marks = form.querySelector('input[name="marks"]')?.value || '100';
    const formDataObj = new FormData();
    formDataObj.append('alloc_id', selectedAlloc.alloc_id);
    formDataObj.append('course_id', selectedAlloc.course_id);
    formDataObj.append('qp_subject', selectedAlloc.course_name);
    formDataObj.append('total_marks', marks);
    formDataObj.append('paper_file', file);

    try {
      const res = await fetch('/api/setter/submit', {
        method: 'POST',
        body: formDataObj
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage('Paper Submitted Successfully! Visual confirmation sent to COE.');
        fetchAllocations();
        setSelectedAlloc(null);
      } else {
        alert(data.message || 'Submission failed');
      }
    } catch (err) {
      console.error('Submission error:', err);
      alert('Network error during submission');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Setter Dashboard</h1>
          <p className="text-gray-500">Question Paper Setter • {user.first_name} {user.last_name}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchAllocations} variant="secondary" disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button onClick={onLogout} variant="secondary"><LogOut size={18} className="mr-2 inline" /> Logout</Button>
        </div>
      </header>

      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-green-100 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <CheckCircle size={20} />
              <p className="font-medium">{successMessage}</p>
            </div>
            <button onClick={() => setSuccessMessage('')} className="text-green-700 hover:text-green-900">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2"><ClipboardList size={20} /> Allocations</h2>
              <div className="flex gap-2">
                <select
                  className="text-xs border rounded p-1"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="All">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Reviewed">Reviewed</option>
                  <option value="Rework">Rework</option>
                </select>
                <Button
                  variant="secondary"
                  className="text-[10px] px-2 py-1"
                  onClick={() => setShowHidden(!showHidden)}
                >
                  {showHidden ? 'Hide Archived' : 'Show All'}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b text-xs font-bold uppercase text-gray-400">
                    <th className="pb-3 px-2">Course</th>
                    <th className="pb-3 px-2">Deadline</th>
                    <th className="pb-3 px-2">Status</th>
                    <th className="pb-3 px-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allocations.filter((a: any) => {
                    const matchesFilter = filter === 'All' || a.submission_status === filter;
                    const isHidden = hiddenAllocations.includes(a.alloc_id);
                    return matchesFilter && (showHidden || !isHidden);
                  }).length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-gray-400">No matching allocations</td></tr>
                  ) : (
                    allocations.filter((a: any) => {
                      const matchesFilter = filter === 'All' || a.submission_status === filter;
                      const isHidden = hiddenAllocations.includes(a.alloc_id);
                      return matchesFilter && (showHidden || !isHidden);
                    }).map((a: any) => (
                      <tr key={a.alloc_id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-2">
                          <p className="font-bold">{a.course_name}</p>
                          <p className="text-xs text-gray-500">{a.course_id}</p>
                        </td>
                        <td className="py-4 px-2">
                          <Timer deadline={a.deadline} label="Due" />
                        </td>
                        <td className="py-4 px-2">
                          <span className={cn("px-2 py-1 rounded-full text-xs font-medium",
                            a.submission_status === 'Pending' ? "bg-yellow-100 text-yellow-700" :
                              a.submission_status === 'Accepted' ? "bg-blue-100 text-blue-700" :
                                a.submission_status === 'Declined' ? "bg-red-100 text-red-700" :
                                  a.submission_status === 'Rework' ? "bg-orange-100 text-orange-700" :
                                    a.submission_status === 'Rejected' ? "bg-red-100 text-red-700" :
                                      "bg-green-100 text-green-700"
                          )}>
                            {a.submission_status}
                          </span>
                          {a.reviewer_remarks && (a.submission_status === 'Rework' || a.submission_status === 'Rejected') && (
                            <div className="mt-2 p-2 bg-orange-50 border border-orange-100 rounded text-[10px] text-orange-800">
                              <p className="font-bold uppercase mb-1">Reviewer Feedback:</p>
                              <p className="italic">"{a.reviewer_remarks}"</p>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-2">
                          <div className="flex flex-col gap-2">
                            {a.submission_status === 'Pending' && (
                              <div className="flex gap-2">
                                <Button onClick={() => handleSetterAction(a.alloc_id, 'Accepted')} className="text-[10px] px-2" variant="success">Accept</Button>
                                <Button onClick={() => handleSetterAction(a.alloc_id, 'Declined')} className="text-[10px] px-2" variant="danger">Reject</Button>
                              </div>
                            )}
                            {(a.submission_status === 'Accepted' || a.submission_status === 'Rework') && (
                              <Button onClick={() => setSelectedAlloc(a)} className="text-xs">
                                {a.submission_status === 'Rework' ? 'Resubmit' : 'Work'}
                              </Button>
                            )}
                            <button
                              onClick={() => {
                                if (hiddenAllocations.includes(a.alloc_id)) {
                                  setHiddenAllocations(hiddenAllocations.filter(id => id !== a.alloc_id));
                                } else {
                                  setHiddenAllocations([...hiddenAllocations, a.alloc_id]);
                                }
                              }}
                              className="text-[10px] text-gray-400 hover:text-gray-600 text-left"
                            >
                              {hiddenAllocations.includes(a.alloc_id) ? 'Restore' : 'Archive'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-8">
          {/* Wallet Section */}
          <WalletCard
            balance={wallet.wallet_balance}
            role="SETTER"
            onWithdraw={() => setSuccessMessage('Withdrawal request submitted to University Finance.')}
            onSettings={() => setSuccessMessage('Please connect your external account (PayPal/Paytm) to enable automatic withdrawals.')}
          />

          <AnimatePresence>
            {selectedAlloc && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <Card className="p-6 bg-gray-900 text-white border-none">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><FileText size={20} /> Active Workspace</h2>
                  <div className="space-y-4">
                    <div className="p-3 bg-white/10 rounded-lg">
                      <p className="text-xs font-bold uppercase text-white/50">Resources</p>
                      <div className="mt-2 space-y-2">
                        {selectedAlloc.appointment_letter_link && (
                          <a
                            href={`/api/files/${selectedAlloc.appointment_letter_link}`}
                            download
                            className="flex items-center gap-2 text-sm hover:underline text-blue-300 w-full text-left"
                          >
                            <Download size={14} /> {selectedAlloc.appointment_letter_link}
                          </a>
                        )}
                        {selectedAlloc.qp_template_link && (
                          <a
                            href={`/api/files/${selectedAlloc.qp_template_link}`}
                            download
                            className="flex items-center gap-2 text-sm hover:underline text-blue-300 w-full text-left"
                          >
                            <Download size={14} /> {selectedAlloc.qp_template_link}
                          </a>
                        )}
                        {selectedAlloc.syllabus_link && (
                          <a
                            href={`/api/files/${selectedAlloc.syllabus_link}`}
                            download
                            className="flex items-center gap-2 text-sm hover:underline text-blue-300 w-full text-left"
                          >
                            <Download size={14} /> {selectedAlloc.syllabus_link}
                          </a>
                        )}
                        {!selectedAlloc.appointment_letter_link && !selectedAlloc.qp_template_link && !selectedAlloc.syllabus_link && (
                          <p className="text-xs text-white/30 italic">No resources provided by COE.</p>
                        )}
                      </div>
                    </div>
                    <div className="p-3 bg-white/10 rounded-lg">
                      <p className="text-xs font-bold uppercase text-white/50">Instructions</p>
                      <p className="text-sm mt-1">{selectedAlloc.instructions || 'No specific instructions.'}</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><Upload size={20} /> Submission Portal</h2>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase text-gray-500">Total Marks</label>
                      <input name="marks" type="number" defaultValue={100} className="w-full p-2 border rounded-lg" required />
                    </div>
                    <div className="relative border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-black transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept=".pdf"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        required
                        onChange={(e) => {
                          const fileName = e.target.files?.[0]?.name;
                          const label = e.target.parentElement?.querySelector('.file-label');
                          if (label && fileName) label.textContent = fileName;
                        }}
                      />
                      <Upload size={32} className="mx-auto mb-2 text-gray-400" />
                      <p className="text-sm font-medium file-label">Click or drag PDF to upload</p>
                      <p className="text-xs text-gray-400 mt-1">Max 10MB</p>
                    </div>
                    <Button type="submit" className="w-full">Submit Question Paper</Button>
                  </form>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

const ReviewerDashboard = ({ user, onLogout }: any) => {
  const [queue, setQueue] = useState([]);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [wallet, setWallet] = useState({ wallet_balance: 0 });
  const [successMessage, setSuccessMessage] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchQueue = useCallback(() => {
    setIsRefreshing(true);
    Promise.all([
      fetch(`/api/reviewer/queue/${user.user_id}`).then(res => res.json()),
      fetch(`/api/wallet/${user.user_id}`).then(res => res.json())
    ]).then(([queueData, walletData]) => {
      setQueue(queueData);
      setWallet(walletData);
    }).finally(() => setIsRefreshing(false));
  }, [user.user_id]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleAction = async (status: string, remarks: string) => {
    const res = await fetch('/api/reviewer/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_id: selectedReview.review_id, status, remarks })
    });
    if (res.ok) {
      setSuccessMessage(`Review submitted as ${status}!`);
      setSelectedReview(null);
      fetchQueue();
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reviewer Dashboard</h1>
          <p className="text-gray-500">Peer Reviewer • {user.first_name} {user.last_name}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchQueue} variant="secondary" disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button onClick={onLogout} variant="secondary"><LogOut size={18} className="mr-2 inline" /> Logout</Button>
        </div>
      </header>

      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-green-100 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <CheckCircle size={20} />
              <p className="font-medium">{successMessage}</p>
            </div>
            <button onClick={() => setSuccessMessage('')} className="text-green-700 hover:text-green-900">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2"><UserCheck size={20} /> Review Queue</h2>
            <div className="space-y-4">
              {queue.length === 0 ? (
                <p className="text-center py-12 text-gray-400">No papers in queue</p>
              ) : (
                queue.map((q: any) => (
                  <div key={q.review_id} className="p-4 border rounded-xl flex justify-between items-center hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedReview(q)}>
                    <div>
                      <p className="font-bold">{q.qp_subject}</p>
                      <p className="text-sm text-gray-500">Course: {q.course_name}</p>
                      <p className="text-xs text-gray-400 mt-1">Assigned on: {q.review_date}</p>
                    </div>
                    <Button variant="secondary" className="text-xs">Review Draft</Button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-8">
          <WalletCard
            balance={wallet.wallet_balance}
            role="REVIEWER"
            onWithdraw={() => setSuccessMessage('Withdrawal request submitted to University Finance.')}
            onSettings={() => setSuccessMessage('Please connect your external account (PayPal/Paytm) to enable automatic withdrawals.')}
          />

          <AnimatePresence>
            {selectedReview && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><FileText size={20} /> Resource Access</h2>
                  <div className="space-y-3">
                    {selectedReview.qp_link ? (
                      <a
                        href={`/api/files/${selectedReview.qp_link}`}
                        download
                        className="flex items-center gap-2 text-sm p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                      >
                        <Download size={14} /> Setter's Draft: {selectedReview.qp_link}
                      </a>
                    ) : (
                      <div className="text-sm p-3 bg-gray-50 rounded-lg text-gray-400 italic">No paper draft uploaded</div>
                    )}
                    <p className="text-[10px] font-bold uppercase text-gray-400 mt-4">Reference Materials</p>
                    <div className="grid grid-cols-1 gap-2">
                      {/* These would ideally come from the allocation record too */}
                      <span className="text-xs text-gray-500 italic">Download links for syllabus and template are available in the Setter's workspace.</span>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><CheckCircle size={20} /> Action Panel</h2>
                  <form onSubmit={(e: any) => {
                    e.preventDefault();
                    handleAction(e.target.status.value, e.target.remarks.value);
                  }} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase text-gray-500">Decision</label>
                      <select name="status" className="w-full p-2 border rounded-lg" required>
                        <option value="Accepted">Accept Paper</option>
                        <option value="Rework">Request Rework</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase text-gray-500">Remarks</label>
                      <textarea name="remarks" className="w-full p-2 border rounded-lg h-24" placeholder="Enter feedback for the setter..." required />
                    </div>
                    <Button type="submit" className="w-full">Submit Review</Button>
                  </form>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP ---

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [workspaceId, setWorkspaceId] = useState('');

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const email = e.target.email.value;
      const password = e.target.password.value;

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, workspace_id: workspaceId })
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response:", text);
        throw new Error(`Server returned non-JSON response: ${text.substring(0, 50)}...`);
      }

      const data = await res.json();
      if (data.success) {
        setUser(data.user);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-black text-white rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ClipboardList size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">QPMS Portal</h1>
            <p className="text-gray-500">Question Paper Management System</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">Email Address</label>
              <input name="email" type="email" placeholder="coe@qpms.com" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-black outline-none transition-all" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">Password</label>
              <input name="password" type="password" placeholder="••••••••" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-black outline-none transition-all" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">Workspace ID (Optional)</label>
              <input
                type="text"
                placeholder="Enter specific ID (e.g., 1, 2, 3)"
                className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
              />
              <p className="text-[10px] text-gray-400">Enter your specific ID to access your private workspace.</p>
            </div>
            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
            <Button type="submit" className="w-full py-3 text-lg" disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign In'}
            </Button>
          </form>
          <div className="mt-8 pt-8 border-t text-center space-y-2">
            <p className="text-xs text-gray-400 uppercase font-bold">Demo Accounts</p>
            <div className="flex justify-center gap-4 text-xs text-gray-500">
              <span>COE: coe@qpms.com (ID: 1)</span>
              <span>Setter: setter@qpms.com (ID: 2)</span>
              <span>Reviewer: reviewer@qpms.com (ID: 3)</span>
            </div>
            <p className="text-[10px] text-gray-300">Password for all: password</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {user.role === 'COE' && <COEDashboard user={user} onLogout={() => setUser(null)} />}
      {user.role === 'SETTER' && <SetterDashboard user={user} onLogout={() => setUser(null)} />}
      {user.role === 'REVIEWER' && <ReviewerDashboard user={user} onLogout={() => setUser(null)} />}
    </div>
  );
}
