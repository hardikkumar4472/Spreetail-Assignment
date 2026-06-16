import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { 
  DollarSign, PlusCircle, ArrowUpRight, ArrowDownRight, 
  Upload, AlertTriangle, CheckCircle2, History as HistoryIcon, 
  Trash2, Users, Info, HelpCircle, LogIn, LogOut, ArrowRight,
  TrendingUp, Home, PieChart, Settings, Bot, Send, Loader2, Sparkles, Download, Edit, Check, X
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });
  const [currentUser, setCurrentUser] = useState(() => {
    return localStorage.getItem('currentUser') || 'Aisha';
  });
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'dashboard';
  });
  const [viewingHomepage, setViewingHomepage] = useState(() => {
    const saved = localStorage.getItem('viewingHomepage');
    return saved === null ? true : saved === 'true';
  });
  const [authMode, setAuthMode] = useState('login');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  
  
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(() => {
    return localStorage.getItem('selectedGroupId') || '';
  });
  const [groupMembers, setGroupMembers] = useState([]);
  const [balances, setBalances] = useState(null);
  const [selectedUserAudit, setSelectedUserAudit] = useState(null);

  useEffect(() => {
    localStorage.setItem('isLoggedIn', isLoggedIn);
  }, [isLoggedIn]);

  useEffect(() => {
    localStorage.setItem('currentUser', currentUser);
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('viewingHomepage', viewingHomepage);
  }, [viewingHomepage]);

  useEffect(() => {
    localStorage.setItem('selectedGroupId', selectedGroupId);
  }, [selectedGroupId]);
  
  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: "Hi! I'm your Spreetail AI Assistant. Ask me about balances, who owes whom, or detailed expenses like 'How much did the Goa trip cost?'" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatApiKey, setChatApiKey] = useState('');
  const [chatNeedsApiKey, setChatNeedsApiKey] = useState(false);

  // Pairwise Audit state
  const [pairwiseUserB, setPairwiseUserB] = useState('');
  const [pairwiseLedger, setPairwiseLedger] = useState(null);
  const [pairwiseLoading, setPairwiseLoading] = useState(false);

  // Advanced Importer state
  const [draftExpenses, setDraftExpenses] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [importJobId, setImportJobId] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [fileContent, setFileContent] = useState('');

  const [history, setHistory] = useState({ expenses: [], settlements: [] });
  
  const [file, setFile] = useState(null);
  const [usdRate, setUsdRate] = useState(83.5);
  const [analysis, setAnalysis] = useState(null);
  const [resolutions, setResolutions] = useState({});
  const [importReport, setImportReport] = useState(null);
  
  
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  
  
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    paidById: '',
    amount: '',
    currency: 'INR',
    splitType: 'equal',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    splitDetails: {}
  });

  const [settlementForm, setSettlementForm] = useState({
    paidById: '',
    receivedById: '',
    amount: '',
    currency: 'INR',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const [groupForm, setGroupForm] = useState({
    name: '',
    description: ''
  });
  const [selectedGroupMembers, setSelectedGroupMembers] = useState({});

  const [memberForm, setMemberForm] = useState({
    userId: '',
    joinedAt: '',
    leftAt: ''
  });

  
  useEffect(() => {
    fetchUsers();
    fetchGroups();
  }, []);

  
  useEffect(() => {
    if (selectedGroupId) {
      fetchBalances(selectedGroupId);
      fetchHistory(selectedGroupId);
      fetchGroupMembers(selectedGroupId);
    }
  }, [selectedGroupId]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`);
      const data = await res.json();
      setUsers(data);
      if (data.length > 0) {
        setMemberForm(prev => ({ ...prev, userId: data[0].id.toString() }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/groups`);
      const data = await res.json();
      setGroups(data);
      if (data.length > 0 && !selectedGroupId) {
        setSelectedGroupId(data[0].id.toString());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGroupMembers = async (groupId) => {
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/members`);
      const data = await res.json();
      setGroupMembers(data);
      if (data.length > 0) {
        setExpenseForm(prev => ({ ...prev, paidById: data[0].user.id.toString() }));
        setSettlementForm(prev => ({ 
          ...prev, 
          paidById: data[0].user.id.toString(), 
          receivedById: (data[1]?.user?.id || data[0].user.id).toString() 
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBalances = async (groupId) => {
    try {
      const url = groupId ? `${API_BASE}/api/balances?groupId=${groupId}` : `${API_BASE}/api/balances`;
      const res = await fetch(url);
      const data = await res.json();
      setBalances(data);
      if (data.detailedBreakdown) {
        setSelectedUserAudit(Object.keys(data.detailedBreakdown).includes('Rohan') ? 'Rohan' : Object.keys(data.detailedBreakdown)[0] || null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHistory = async (groupId) => {
    try {
      const url = groupId ? `${API_BASE}/api/history?groupId=${groupId}` : `${API_BASE}/api/history`;
      const res = await fetch(url);
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error(err);
    }
  };

  
  const isMemberActiveOnDate = (member, dateStr) => {
    if (!member) return false;
    const date = new Date(dateStr);
    if (member.joinedAt && date < new Date(member.joinedAt)) return false;
    if (member.leftAt && date > new Date(member.leftAt)) return false;
    return true;
  };

  
  useEffect(() => {
    if (expenseForm.date && groupMembers.length > 0) {
      const updatedDetails = { ...expenseForm.splitDetails };
      let changed = false;
      groupMembers.forEach((member) => {
        const active = isMemberActiveOnDate(member, expenseForm.date);
        if (!active && updatedDetails[member.user.id] !== undefined) {
          delete updatedDetails[member.user.id];
          changed = true;
          const checkbox = document.getElementById(`user-check-${member.user.id}`);
          if (checkbox) checkbox.checked = false;
        }
      });
      if (changed) {
        setExpenseForm(prev => ({ ...prev, splitDetails: updatedDetails }));
      }
    }
  }, [expenseForm.date, groupMembers]);

  useEffect(() => {
    if (selectedGroupId && currentUser && pairwiseUserB) {
      fetchPairwiseLedger(selectedGroupId, currentUser, pairwiseUserB);
    } else {
      setPairwiseLedger(null);
    }
  }, [selectedGroupId, currentUser, pairwiseUserB]);

  const fetchPairwiseLedger = async (groupId, userA, userB) => {
    setPairwiseLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/audit/pairwise?groupId=${groupId}&userA=${userA}&userB=${userB}`);
      const data = await res.json();
      setPairwiseLedger(data);
    } catch (err) {
      console.error(err);
    } finally {
      setPairwiseLoading(false);
    }
  };

  const handleChatSend = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const msgText = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { sender: 'user', text: msgText }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msgText,
          groupId: parseInt(selectedGroupId, 10),
          apiKey: chatApiKey
        })
      });
      const data = await res.json();
      if (data.error === 'MISSING_API_KEY') {
        setChatNeedsApiKey(true);
        setChatMessages(prev => [...prev, { sender: 'bot', text: data.reply }]);
      } else {
        setChatMessages(prev => [...prev, { sender: 'bot', text: data.reply }]);
      }
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { sender: 'bot', text: 'Error connecting to the AI assistant. Make sure your server is running.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  
  const handleFileChange = (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        setFileContent(text);
        await uploadCSVContent(text, uploadedFile.name);
      };
      reader.readAsText(uploadedFile);
    }
  };

  const uploadCSVContent = async (csvContent, name) => {
    try {
      const res = await fetch(`${API_BASE}/api/import/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent, fileName: name, groupId: parseInt(selectedGroupId, 10) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze CSV");
      
      setImportJobId(data.importJobId);
      setAnomalies(data.anomalies);
      setDraftExpenses(data.parsedExpenses);

      const initialResolutions = {};
      data.parsedExpenses.forEach((exp) => {
        initialResolutions[exp.rowNumber] = { action: "APPROVE", resolvedData: JSON.parse(JSON.stringify(exp)) };
      });
      data.anomalies.forEach((anom) => {
        if (anom.anomalyType === "DUPLICATE_EXPENSE") {
          initialResolutions[anom.rowNumber].action = "REJECT";
        }
      });
      setResolutions(initialResolutions);
      
      setAnalysis({
        anomalies: data.anomalies.map(a => ({
          id: a.id,
          type: a.anomalyType,
          severity: a.anomalyType === 'MISSING_PAYER' || a.anomalyType === 'INVALID_DATE' ? 'HIGH' : 'MEDIUM',
          message: a.description,
          rowNum: a.rowNumber,
          originalValue: "",
          proposedValue: a.proposedAction
        })),
        processedRows: data.parsedExpenses
      });
    } catch (err) {
      console.error(err);
      alert('Error previewing CSV: ' + err.message);
    }
  };

  const executeImport = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/import/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importJobId,
          groupId: parseInt(selectedGroupId, 10),
          resolutions,
          usdRate
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resolve import");

      if (data.success) {
        setImportReport(data.importReport);
        setAnalysis(null);
        setFile(null);
        setDraftExpenses([]);
        setAnomalies([]);
        await fetchGroups();
        if (selectedGroupId) {
          await fetchBalances(selectedGroupId);
          await fetchHistory(selectedGroupId);
        }
        alert('CSV Imported successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Import execution failed: ' + err.message);
    }
  };

  const exportOverallLedgerPDF = () => {
    if (!balances) return;
    const doc = new jsPDF();
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.text("SplitFlat Shared Flat Ledger Report", 14, 20);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 27);
    doc.text(`Group: ${groups.find(g => g.id.toString() === selectedGroupId)?.name || 'Flat 204'}`, 14, 33);
    
    const balanceBody = Object.entries(balances.netBalances).map(([name, bal]) => [
      name,
      bal >= 0 ? `+INR ${bal.toFixed(2)}` : `-INR ${Math.abs(bal).toFixed(2)}`
    ]);
    
    doc.autoTable({
      startY: 40,
      head: [["Member", "Net Balance"]],
      body: balanceBody,
      theme: 'grid',
      headStyles: { fillColor: [121, 85, 72] }
    });
    
    const settlementBody = balances.simplifiedPayments.map(p => [
      p.from,
      p.to,
      `INR ${p.amount.toFixed(2)}`
    ]);
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Suggested Settlements to Clear Debts", 14, doc.lastAutoTable.finalY + 15);
    
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 20,
      head: [["From", "To", "Amount"]],
      body: settlementBody.length > 0 ? settlementBody : [["-", "-", "All Settled!"]],
      theme: 'grid',
      headStyles: { fillColor: [110, 142, 117] }
    });
    
    doc.save("overall_ledger_report.pdf");
  };

  const exportPairwiseLedgerPDF = () => {
    if (!pairwiseLedger) return;
    const doc = new jsPDF();
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.text("SplitFlat Pairwise Audit Ledger", 14, 20);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Members: ${pairwiseLedger.userA} vs ${pairwiseLedger.userB}`, 14, 27);
    doc.text(`Net Pairwise Balance: ${pairwiseLedger.netBalance >= 0 ? `${pairwiseLedger.userB} owes ${pairwiseLedger.userA} INR ${pairwiseLedger.netBalance.toFixed(2)}` : `${pairwiseLedger.userA} owes ${pairwiseLedger.userB} INR ${Math.abs(pairwiseLedger.netBalance).toFixed(2)}`}`, 14, 33);
    
    const body = pairwiseLedger.ledger.map(item => [
      new Date(item.date).toLocaleDateString(),
      item.description,
      item.payer,
      item.effect.includes("PAID") ? "Settlement Payment" : "Expense Split Share",
      `INR ${item.amountInINR.toFixed(2)}`,
      `INR ${item.runningBalance.toFixed(2)}`
    ]);
    
    doc.autoTable({
      startY: 40,
      head: [["Date", "Description", "Payer", "Type", "Amount", "Running Balance"]],
      body,
      theme: 'grid',
      headStyles: { fillColor: [121, 85, 72] }
    });
    
    doc.save(`pairwise_audit_${pairwiseLedger.userA}_${pairwiseLedger.userB}.pdf`);
  };

  
  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    try {
      const membersPayload = Object.values(selectedGroupMembers).map(m => ({
        userId: parseInt(m.userId, 10),
        joinedAt: m.joinedAt || null,
        leftAt: m.leftAt || null
      }));
      const res = await fetch(`${API_BASE}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...groupForm,
          members: membersPayload
        }),
      });
      if (res.ok) {
        const newGroup = await res.json();
        setShowGroupModal(false);
        setGroupForm({ name: '', description: '' });
        setSelectedGroupMembers({});
        await fetchGroups();
        setSelectedGroupId(newGroup.id.toString());
        alert('Group created successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to create group');
    }
  };

  
  const handleMemberSubmit = async (e) => {
    e.preventDefault();
    if (!selectedGroupId) return;
    try {
      const res = await fetch(`${API_BASE}/api/groups/${selectedGroupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: parseInt(memberForm.userId, 10),
          joinedAt: memberForm.joinedAt || null,
          leftAt: memberForm.leftAt || null
        }),
      });
      if (res.ok) {
        setShowMemberModal(false);
        setMemberForm(prev => ({ ...prev, joinedAt: '', leftAt: '' }));
        fetchGroupMembers(selectedGroupId);
        fetchBalances(selectedGroupId);
        fetchHistory(selectedGroupId);
        alert('Group membership updated successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update group membership');
    }
  };

  
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    const endpoint = authMode === 'login' ? `${API_BASE}/api/auth/login` : `${API_BASE}/api/auth/register`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput,
          password: passwordInput
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
      } else {
        setCurrentUser(data.name);
        setIsLoggedIn(true);
        setViewingHomepage(false);
        setUsernameInput('');
        setPasswordInput('');
        await fetchUsers();
        await fetchGroups();
      }
    } catch (err) {
      console.error(err);
      setAuthError('Server connection error');
    }
  };

  
  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!selectedGroupId) return;

    const payload = {
      groupId: parseInt(selectedGroupId, 10),
      description: expenseForm.description,
      paidById: parseInt(expenseForm.paidById, 10),
      amount: parseFloat(expenseForm.amount),
      currency: expenseForm.currency,
      splitType: expenseForm.splitType,
      date: expenseForm.date,
      notes: expenseForm.notes,
      splitDetails: expenseForm.splitDetails
    };

    try {
      const res = await fetch(`${API_BASE}/api/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowExpenseModal(false);
        fetchBalances(selectedGroupId);
        fetchHistory(selectedGroupId);
        setExpenseForm({
          description: '',
          paidById: groupMembers[0]?.user?.id.toString() || '',
          amount: '',
          currency: 'INR',
          splitType: 'equal',
          date: new Date().toISOString().split('T')[0],
          notes: '',
          splitDetails: {}
        });
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to add expense');
      }
    } catch (err) {
      console.error(err);
    }
  };

  
  const handleSettlementSubmit = async (e) => {
    e.preventDefault();
    if (!selectedGroupId) return;

    const payload = {
      groupId: parseInt(selectedGroupId, 10),
      paidById: parseInt(settlementForm.paidById, 10),
      receivedById: parseInt(settlementForm.receivedById, 10),
      amount: parseFloat(settlementForm.amount),
      currency: settlementForm.currency,
      date: settlementForm.date,
      notes: settlementForm.notes
    };

    try {
      const res = await fetch(`${API_BASE}/api/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowSettlementModal(false);
        fetchBalances(selectedGroupId);
        fetchHistory(selectedGroupId);
        setSettlementForm({
          paidById: groupMembers[0]?.user?.id.toString() || '',
          receivedById: (groupMembers[1]?.user?.id || groupMembers[0]?.user?.id || '').toString(),
          amount: '',
          currency: 'INR',
          date: new Date().toISOString().split('T')[0],
          notes: ''
        });
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to record settlement');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteExpense = async (id) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await fetch(`${API_BASE}/api/expenses/${id}`, { method: 'DELETE' });
      fetchBalances(selectedGroupId);
      fetchHistory(selectedGroupId);
    } catch (err) {
      console.error(err);
    }
  };

  
  // Render Homepage Landing
  if (viewingHomepage) {
    return (
      <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh', padding: '2rem 0' }}>
        <div className="homepage-container">
          <div className="hero-section">
            <div className="hero-text">
              <h1 style={{ fontSize: '3.5rem', fontWeight: 800, lineHeight: '1.15', marginBottom: '1.5rem' }}>Cozy Shared Expense Tracking.</h1>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '2.5rem', lineHeight: '1.6' }}>
                SplitFlat helps Aisha, Rohan, Priya, Meera, Sam, and Dev clean up duplicate entries, track timeline boundaries, settle debts, and manage flat expenses with absolute clarity.
              </p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn" style={{ padding: '1rem 2rem', fontSize: '1.05rem' }} onClick={() => setViewingHomepage(false)}>
                  Get Started / Sign In
                </button>
                <a href="#features" className="btn btn-secondary" style={{ padding: '1rem 2rem', fontSize: '1.05rem', textDecoration: 'none' }}>
                  Learn More
                </a>
              </div>
            </div>
            <div className="hero-illustration">
              <svg width="280" height="240" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="10" width="180" height="140" rx="16" fill="#F4ECE1" />
                <path d="M40 30h120v4H40z" fill="#D7C4B7" />
                <circle cx="100" cy="45" r="10" fill="#E8DFD3" />
                <path d="M100 55v15" stroke="#795548" strokeWidth="2" />
                
                <path d="M30 115h140v12c0 4.4-3.6 8-8 8H38c-4.4 0-8-3.6-8-8v-12z" fill="#795548" />
                <path d="M35 85h130c2.8 0 5 2.2 5 5v25H30V90c0-2.8 2.2-5 5-5z" fill="#5D4037" />
                <rect x="25" y="95" width="12" height="35" rx="4" fill="#3E2723" />
                <rect x="163" y="95" width="12" height="35" rx="4" fill="#3E2723" />
                
                <ellipse cx="100" cy="135" rx="35" ry="8" fill="#D7A15C" />
                <path d="M85 135l-5 12h5v-12zm30 0l5 12h-5v-12z" fill="#A1887F" />
                <circle cx="100" cy="132" r="3" fill="#6E8E75" />
                
                <circle cx="55" cy="80" r="8" fill="#D7A15C" />
                <path d="M47 88c0-5 16-5 16 0v16H47V88z" fill="#6E8E75" />
                <circle cx="90" cy="75" r="8" fill="#A1887F" />
                <path d="M82 83c0-5 16-5 16 0v20H82V83z" fill="#D7A15C" />
                <circle cx="120" cy="77" r="8" fill="#BCAAA4" />
                <path d="M112 85c0-5 16-5 16 0v18H112V85z" fill="#C87A6F" />
                <circle cx="148" cy="82" r="8" fill="#8FA2A6" />
                <path d="M140 90c0-5 16-5 16 0v14H140V90z" fill="#795548" />
              </svg>
            </div>
          </div>

          <div id="features" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '4rem', paddingBottom: '4rem' }}>
            <h2 style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
              Engineered for Messy Flatmate Expenses
            </h2>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto 4rem auto', fontSize: '1.1rem', lineHeight: '1.6' }}>
              From importing raw spreadsheet records to resolving complex debt networks, SplitFlat automates the entire coordination process.
            </p>

            <div className="timeline-container">
              <div className="timeline-line"></div>

              <div className="timeline-item">
                <div className="timeline-badge">1</div>
                <div className="timeline-content">
                  <div className="timeline-meta">Step 1 — Ingestion</div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Upload size={22} style={{ color: 'var(--accent-color)' }} />
                    Smart CSV Ingestion
                  </h3>
                  <p>
                    Directly drag and drop your flat's historical spreadsheet. SplitFlat instantly analyzes the data, parsing currency rates, sanitizing input typos, and identifying duplicate record anomalies for user-controlled correction.
                  </p>
                </div>
              </div>

              <div className="timeline-item">
                <div className="timeline-badge">2</div>
                <div className="timeline-content">
                  <div className="timeline-meta">Step 2 — Date Matching</div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Users size={22} style={{ color: 'var(--accent-color)' }} />
                    Timeline Enforcement
                  </h3>
                  <p>
                    Membership boundaries are strictly enforced. When flatmates move in or leave (like Sam moving in late or Meera moving out early), SplitFlat ensures they are only split into expenses that fall within their active stay timelines.
                  </p>
                </div>
              </div>

              <div className="timeline-item">
                <div className="timeline-badge">3</div>
                <div className="timeline-content">
                  <div className="timeline-meta">Step 3 — Optimization</div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <TrendingUp size={22} style={{ color: 'var(--accent-color)' }} />
                    Debt Simplification
                  </h3>
                  <p>
                    Aisha's View runs greedy simplification algorithms to minimize active transactions. It restructures the net debt network so you only pay or receive a single sum, rather than transferring multiple fragmented payments.
                  </p>
                </div>
              </div>

              <div className="timeline-item">
                <div className="timeline-badge">4</div>
                <div className="timeline-content">
                  <div className="timeline-meta">Step 4 — Audit</div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Info size={22} style={{ color: 'var(--accent-color)' }} />
                    Audit Transparency
                  </h3>
                  <p>
                    Rohan's View ensures mathematical accountability with zero black-box calculations. Every calculated balance can be audited back to the individual transaction line items, showing exactly how each rupee was split.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-illustration-side">
            <svg width="280" height="240" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Cozy Room Background */}
              <rect x="10" y="10" width="180" height="140" rx="16" fill="#F4ECE1" />
              <path d="M40 30h120v4H40z" fill="#D7C4B7" />
              <circle cx="100" cy="45" r="10" fill="#E8DFD3" />
              <path d="M100 55v15" stroke="#795548" strokeWidth="2" />
              
              {/* Cozy Sofa */}
              <path d="M30 115h140v12c0 4.4-3.6 8-8 8H38c-4.4 0-8-3.6-8-8v-12z" fill="#795548" />
              <path d="M35 85h130c2.8 0 5 2.2 5 5v25H30V90c0-2.8 2.2-5 5-5z" fill="#5D4037" />
              <rect x="25" y="95" width="12" height="35" rx="4" fill="#3E2723" />
              <rect x="163" y="95" width="12" height="35" rx="4" fill="#3E2723" />
              
              {/* Coffee Table */}
              <ellipse cx="100" cy="135" rx="35" ry="8" fill="#D7A15C" />
              <path d="M85 135l-5 12h5v-12zm30 0l5 12h-5v-12z" fill="#A1887F" />
              <circle cx="100" cy="132" r="3" fill="#6E8E75" />
              
              {/* Illustrated Friends Sitting */}
              {/* Friend 1 (Aisha) */}
              <circle cx="55" cy="80" r="8" fill="#D7A15C" />
              <path d="M47 88c0-5 16-5 16 0v16H47V88z" fill="#6E8E75" />
              {/* Friend 2 (Rohan) */}
              <circle cx="90" cy="75" r="8" fill="#A1887F" />
              <path d="M82 83c0-5 16-5 16 0v20H82V83z" fill="#D7A15C" />
              {/* Friend 3 (Priya) */}
              <circle cx="120" cy="77" r="8" fill="#BCAAA4" />
              <path d="M112 85c0-5 16-5 16 0v18H112V85z" fill="#C87A6F" />
              {/* Friend 4 (Meera) */}
              <circle cx="148" cy="82" r="8" fill="#8FA2A6" />
              <path d="M140 90c0-5 16-5 16 0v14H140V90z" fill="#795548" />
            </svg>
            <h2 style={{ marginTop: '1.5rem', fontFamily: 'var(--font-display)', color: 'var(--accent-hover)' }}>SplitFlat</h2>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem', fontSize: '0.9rem' }}>
              Cozy shared expense tracking for flatmates.
            </p>
          </div>
          <div className="login-form-side">
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
              Welcome Back
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              Sign in using your flatmate profile name & password
            </p>

            {authError && (
              <div style={{ color: 'var(--danger)', backgroundColor: 'rgba(200, 122, 111, 0.15)', padding: '0.75rem', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 600 }}>
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label>Username</label>
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="e.g. Aisha"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Password</label>
                <input 
                  type="password" 
                  className="form-control"
                  placeholder="••••••••"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>

              <button className="btn" style={{ width: '100%', padding: '0.8rem' }} type="submit">
                Sign In
              </button>

              <button 
                type="button"
                className="btn btn-secondary" 
                style={{ width: '100%', padding: '0.8rem', marginTop: '0.75rem' }} 
                onClick={() => {
                  setUsernameInput('Aisha');
                  setPasswordInput('password123');
                }}
              >
                Autofill Test Credentials
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  
  let chartData = [];
  if (balances?.netBalances) {
    chartData = Object.entries(balances.netBalances).map(([name, bal]) => ({
      name,
      value: Math.abs(bal)
    }));
  }
  const totalChartVal = chartData.reduce((acc, curr) => acc + curr.value, 0) || 1;

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="app-sidebar">
        <div className="sidebar-logo">
          <Users size={26} />
          <span>SplitFlat</span>
        </div>

        <nav className="sidebar-menu">
          <button 
            className={`sidebar-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Home size={18} />
            Dashboard
          </button>
          <button 
            className={`sidebar-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <HistoryIcon size={18} />
            History & Bills
          </button>
          <button 
            className={`sidebar-btn ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            <Upload size={18} />
            Import CSV
          </button>
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Active Group</span>
            <select 
              className="form-control" 
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginTop: '0.25rem' }}
              onClick={() => setShowGroupModal(true)}
            >
              + New Group
            </button>
          </div>

          <div style={{ display: 'flex', justifyAll: 'center', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{currentUser}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Logged In</div>
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0.4rem', borderRadius: '50%' }} 
              title="Sign Out"
              onClick={() => {
                setIsLoggedIn(false);
                setViewingHomepage(true);
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="app-content">
        <div className="content-header">
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>
              {activeTab === 'dashboard' ? 'Overview' : activeTab === 'history' ? 'Transaction History' : 'CSV Import Wizard'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {activeTab === 'dashboard' ? 'Track household expenses, balances, and settle up easily.' : activeTab === 'history' ? 'Detailed history of payments and shared expenses.' : 'Ingest raw expenses_export.csv sheets dynamically.'}
            </p>
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <div>
            {/* Quick Summary Cards */}
            <div className="grid-cols-3">
              <div className="card stat-card">
                <div>
                  <div className="stat-label">Your Net Balance</div>
                  <div className={`stat-val ${balances?.netBalances?.[currentUser] >= 0 ? 'success' : 'danger'}`} 
                       style={{ color: balances?.netBalances?.[currentUser] >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    ₹{balances?.netBalances?.[currentUser]?.toFixed(2) || '0.00'}
                  </div>
                </div>
                <div style={{ padding: '10px', borderRadius: '50%', backgroundColor: balances?.netBalances?.[currentUser] >= 0 ? 'rgba(110, 142, 117, 0.15)' : 'rgba(200, 122, 111, 0.15)' }}>
                  {balances?.netBalances?.[currentUser] >= 0 ? <ArrowUpRight color="var(--success)" /> : <ArrowDownRight color="var(--danger)" />}
                </div>
              </div>

              <div className="card stat-card">
                <div>
                  <div className="stat-label">Total Group Spent</div>
                  <div className="stat-val" style={{ color: 'var(--accent-color)' }}>
                    ₹{history.expenses.reduce((acc, curr) => acc + curr.amountInInr, 0).toFixed(2)}
                  </div>
                </div>
                <div style={{ padding: '10px', borderRadius: '50%', backgroundColor: 'rgba(121, 85, 72, 0.15)' }}>
                  <DollarSign color="var(--accent-color)" />
                </div>
              </div>

              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyAll: 'center', justifyContent: 'center' }}>
                <span className="stat-label" style={{ marginBottom: '0.5rem' }}>Quick Actions</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn" style={{ flex: 1 }} onClick={() => setShowExpenseModal(true)}>
                    <PlusCircle size={16} />
                    Expense
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowSettlementModal(true)}>
                    Settle Up
                  </button>
                </div>
              </div>
            </div>

            <div className="grid-cols-2">
              {/* Balances Board */}
              <div className="card">
                <h3 className="card-title">
                  <span>
                    Group Balances
                    <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>
                      {groups.find(g => g.id.toString() === selectedGroupId)?.name || 'Loading...'}
                    </span>
                  </span>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => setShowMemberModal(true)}
                  >
                    Manage Members
                  </button>
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                  {balances?.netBalances && Object.entries(balances.netBalances).map(([name, bal]) => {
                    const memberInfo = groupMembers.find(m => m.user.name === name);
                    const timelineText = memberInfo 
                      ? `${memberInfo.joinedAt ? 'Joined: ' + new Date(memberInfo.joinedAt).toISOString().split('T')[0] : ''}${memberInfo.leftAt ? ' | Left: ' + new Date(memberInfo.leftAt).toISOString().split('T')[0] : ''}`
                      : 'Active';

                    return (
                      <div 
                        key={name}
                        onClick={() => setSelectedUserAudit(name)}
                        className={`card user-balance-card ${bal >= 0 ? 'positive' : 'negative'} ${selectedUserAudit === name ? 'selected' : ''}`}
                        style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyAll: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                            {name[0]}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {timelineText}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: bal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {bal >= 0 ? `+₹${bal.toFixed(2)}` : `-₹${Math.abs(bal).toFixed(2)}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Settlement Path & Chart Visualizer */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyAll: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 className="card-title">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Suggested Settlements
                      <HelpCircle size={16} style={{ color: 'var(--text-muted)' }} title="Suggested path simplifies transfers." />
                    </span>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      onClick={exportOverallLedgerPDF}
                    >
                      <Download size={12} />
                      PDF Report
                    </button>
                  </h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                    {balances?.simplifiedPayments && balances.simplifiedPayments.length > 0 ? (
                      balances.simplifiedPayments.map((pmt, i) => (
                        <div key={i} className="settlement-flow-card">
                          <div className="settlement-avatar">{pmt.from[0]}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-color)' }}>₹{pmt.amount.toFixed(2)}</span>
                            <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.25rem', marginTop: '0.25rem' }}>
                              <div style={{ height: '2px', backgroundColor: 'var(--border-color)', flex: 1 }}></div>
                              <ArrowRight size={14} color="var(--text-muted)" />
                              <div style={{ height: '2px', backgroundColor: 'var(--border-color)', flex: 1 }}></div>
                            </div>
                          </div>
                          <div className="settlement-avatar">{pmt.to[0]}</div>
                        </div>
                      ))
                    ) : (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        All settled! No payments required.
                      </div>
                    )}
                  </div>
                </div>

                {/* Donut Chart Visualizer (SVG-based) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                  <svg width="100" height="100" viewBox="0 0 42 42" className="svg-donut">
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--bg-tertiary)" strokeWidth="6" />
                    {chartData.map((item, index) => {
                      const percentage = (item.value / totalChartVal) * 100;
                      
                      let offset = 0;
                      for (let i = 0; i < index; i++) {
                        offset += (chartData[i].value / totalChartVal) * 100;
                      }
                      const strokeColors = ['var(--accent-color)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--info)', 'var(--text-secondary)'];
                      return (
                        <circle 
                          key={item.name}
                          cx="21" 
                          cy="21" 
                          r="15.915" 
                          fill="transparent" 
                          stroke={strokeColors[index % strokeColors.length]} 
                          strokeWidth="6" 
                          strokeDasharray={`${percentage} ${100 - percentage}`} 
                          strokeDashoffset={100 - offset}
                          className="svg-donut-segment"
                        />
                      );
                    })}
                  </svg>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem', flex: 1 }}>
                    {chartData.map((item, index) => {
                      const strokeColors = ['var(--accent-color)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--info)', 'var(--text-secondary)'];
                      return (
                        <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: strokeColors[index % strokeColors.length] }}></span>
                          <span style={{ fontWeight: 600 }}>{item.name}: ₹{item.value.toFixed(0)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Rohan's "No Magic Numbers" Audit Panel */}
            {selectedUserAudit && balances?.detailedBreakdown?.[selectedUserAudit] && (
              <div className="card" style={{ marginTop: '2rem' }}>
                <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>
                  Breakdown for {selectedUserAudit}
                  <span className="badge badge-low">Audit Log</span>
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  Rohan's Request: Detailed proof of transactions composing the balance.
                </p>

                <div className="grid-cols-2" style={{ gap: '2rem' }}>
                  {/* What they paid */}
                  <div>
                    <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)' }}>
                      <CheckCircle2 size={16} />
                      Expenses Paid / Credited (₹{balances.detailedBreakdown[selectedUserAudit].totalPaid.toFixed(2)})
                    </h4>
                    
                    <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {balances.detailedBreakdown[selectedUserAudit].paidExpenses.map((exp) => (
                        <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'rgba(110, 142, 117, 0.08)', borderRadius: '12px', border: '1px solid rgba(110, 142, 117, 0.15)' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{exp.description}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(exp.date).toLocaleDateString()}</div>
                          </div>
                          <div style={{ fontWeight: 700, color: 'var(--success)' }}>+₹{exp.amount.toFixed(2)}</div>
                        </div>
                      ))}
                      {balances.detailedBreakdown[selectedUserAudit].paidSettlements.map((set) => (
                        <div key={set.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'rgba(110, 142, 117, 0.08)', borderRadius: '12px', border: '1px solid rgba(110, 142, 117, 0.15)' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{set.description}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(set.date).toLocaleDateString()}</div>
                          </div>
                          <div style={{ fontWeight: 700, color: 'var(--success)' }}>+₹{set.amount.toFixed(2)}</div>
                        </div>
                      ))}
                      {balances.detailedBreakdown[selectedUserAudit].paidExpenses.length === 0 && balances.detailedBreakdown[selectedUserAudit].paidSettlements.length === 0 && (
                        <div style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>No payments logged.</div>
                      )}
                    </div>
                  </div>

                  {/* What they owe */}
                  <div>
                    <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
                      <AlertTriangle size={16} />
                      Splits Owed / Debited (₹{balances.detailedBreakdown[selectedUserAudit].totalOwed.toFixed(2)})
                    </h4>
                    
                    <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {balances.detailedBreakdown[selectedUserAudit].owedSplits.map((split, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'rgba(200, 122, 111, 0.08)', borderRadius: '12px', border: '1px solid rgba(200, 122, 111, 0.15)' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{split.description}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Paid by {split.paidBy} on {new Date(split.date).toLocaleDateString()}</div>
                          </div>
                          <div style={{ fontWeight: 700, color: 'var(--danger)' }}>-₹{split.amount.toFixed(2)}</div>
                        </div>
                      ))}
                      {balances.detailedBreakdown[selectedUserAudit].receivedSettlements.map((set) => (
                        <div key={set.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'rgba(200, 122, 111, 0.08)', borderRadius: '12px', border: '1px solid rgba(200, 122, 111, 0.15)' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{set.description}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(set.date).toLocaleDateString()}</div>
                          </div>
                          <div style={{ fontWeight: 700, color: 'var(--danger)' }}>-₹{set.amount.toFixed(2)}</div>
                        </div>
                      ))}
                      {balances.detailedBreakdown[selectedUserAudit].owedSplits.length === 0 && balances.detailedBreakdown[selectedUserAudit].receivedSettlements.length === 0 && (
                        <div style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>No debts.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Rohan's Pair-wise Audit Ledger Panel */}
            <div className="card" style={{ marginTop: '2rem' }}>
              <h3 className="card-title">
                Pair-wise Audit Ledger
                <span className="badge badge-info">Audit Log</span>
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Select a member to audit your exact shared transactions and running balance.
              </p>

              <div className="form-group" style={{ maxWidth: '300px', marginBottom: '1.5rem' }}>
                <label>Audit With</label>
                <select
                  className="form-control"
                  value={pairwiseUserB}
                  onChange={(e) => setPairwiseUserB(e.target.value)}
                >
                  <option value="">-- Select Member --</option>
                  {groupMembers.filter(m => m.user.name !== currentUser).map(m => (
                    <option key={m.user.id} value={m.user.name}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              {pairwiseLoading && (
                <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading audit ledger...</div>
              )}

              {!pairwiseLoading && pairwiseLedger && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', backgroundColor: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '12px' }}>
                    <div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                        {pairwiseLedger.netBalance >= 0 
                          ? `${pairwiseLedger.userB} owes you overall:` 
                          : `You owe ${pairwiseLedger.userB} overall:`}
                      </span>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: pairwiseLedger.netBalance >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '0.25rem' }}>
                        ₹{Math.abs(pairwiseLedger.netBalance).toFixed(2)}
                      </div>
                    </div>
                    <button className="btn btn-secondary" onClick={exportPairwiseLedgerPDF}>
                      <Download size={14} /> Export to PDF
                    </button>
                  </div>

                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Payer</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Running Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pairwiseLedger.ledger.map((item) => (
                          <tr key={item.id}>
                            <td>{new Date(item.date).toLocaleDateString()}</td>
                            <td>{item.description}</td>
                            <td>{item.payer}</td>
                            <td>
                              <span className={`badge ${item.effect.includes("PAID") ? 'badge-high' : 'badge-low'}`}>
                                {item.effect.includes("PAID") ? "Settlement" : "Bill Share"}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600 }}>{item.currency} {item.originalAmount.toFixed(2)}</td>
                            <td style={{ fontWeight: 700, color: item.runningBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              ₹{item.runningBalance.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {pairwiseLedger.ledger.length === 0 && (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                              No pairwise transaction history found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Transaction History</h3>
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Paid By</th>
                    <th>Original Amount</th>
                    <th>Amount in INR</th>
                    <th>Split Details</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.expenses.map((exp) => (
                    <tr key={exp.id}>
                      <td>{new Date(exp.date).toLocaleDateString()}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{exp.description}</div>
                        {exp.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{exp.notes}</div>}
                      </td>
                      <td><span className="badge badge-low">Expense</span></td>
                      <td>{exp.paidBy.name}</td>
                      <td>{exp.currency} {exp.amount.toFixed(2)}</td>
                      <td>₹{exp.amountInInr.toFixed(2)}</td>
                      <td>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {exp.splits.map((s) => `${s.user.name} (₹${s.amount})`).join(', ')}
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-danger" style={{ padding: '0.3rem 0.6rem' }} onClick={() => deleteExpense(exp.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {history.settlements.map((set) => (
                    <tr key={`set-${set.id}`}>
                      <td>{new Date(set.date).toLocaleDateString()}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{set.notes || 'Settlement'}</div>
                      </td>
                      <td><span className="badge badge-high">Settlement</span></td>
                      <td>{set.paidBy.name}</td>
                      <td>{set.currency} {set.amount.toFixed(2)}</td>
                      <td>₹{set.amountInInr.toFixed(2)}</td>
                      <td>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Recipient: {set.receivedBy.name}
                        </div>
                      </td>
                      <td>-</td>
                    </tr>
                  ))}
                  {history.expenses.length === 0 && history.settlements.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No transactions logged yet. Use the "Import CSV" tab to load data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CSV Import Tab */}
        {activeTab === 'import' && (
          <div>
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h3 className="card-title">Ingest Historical CSV</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Upload the raw spreadsheet export `expenses_export.csv`. The engine will scan for duplicates, out-of-period active splits, and exchange rates.
              </p>

              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>USD to INR Exchange Rate</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    value={usdRate} 
                    onChange={(e) => setUsdRate(parseFloat(e.target.value))} 
                  />
                </div>
              </div>

              <label className="upload-zone">
                <Upload size={32} className="upload-icon" />
                <h4>Select Expenses CSV File</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  {file ? file.name : 'Click to browse files'}
                </p>
                <input type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
              </label>
            </div>

            {/* Anomaly Preview and Approval Panel */}
            {analysis && (
              <div className="card" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 className="card-title" style={{ margin: 0 }}>
                    Detected Anomalies ({analysis.anomalies.length})
                  </h3>
                  <button className="btn btn-success" onClick={executeImport}>
                    Approve Resolutions & Ingest CSV
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {analysis.anomalies.map((anomaly) => (
                    <div key={anomaly.id} className="anomaly-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--border-radius)' }}>
                      <div className="anomaly-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <AlertTriangle size={18} color={anomaly.severity === 'HIGH' ? 'var(--danger)' : 'var(--warning)'} />
                          <span style={{ fontWeight: 600 }}>{anomaly.type}</span>
                          <span className={`badge ${anomaly.severity === 'HIGH' ? 'badge-high' : 'badge-medium'}`}>
                            {anomaly.severity}
                          </span>
                        </div>
                        {anomaly.rowNum && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            CSV Row {anomaly.rowNum}
                          </span>
                        )}
                      </div>

                      <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        {anomaly.message}
                      </p>

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem' }}>
                        {anomaly.originalValue && <span>Original: <strong>{anomaly.originalValue}</strong></span>}
                        {anomaly.proposedValue && <span>Resolved Auto: <strong>{anomaly.proposedValue}</strong></span>}
                      </div>

                      {/* Interactive Controls for Resolution */}
                      {anomaly.type === 'DUPLICATE_ENTRY' && (
                        <div className="anomaly-resolution-options">
                          <span style={{ fontSize: '0.85rem', alignSelf: 'center', color: 'var(--text-secondary)' }}>Choose Action:</span>
                          {anomaly.rows.map((rowNum) => (
                            <button
                              key={rowNum}
                              className={`btn btn-secondary ${resolutions[anomaly.id]?.keepRow === rowNum ? 'active' : ''}`}
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                              onClick={() => {
                                setResolutions(prev => ({
                                  ...prev,
                                  [anomaly.id]: {
                                    action: 'RESOLVED_DUPLICATE',
                                    keepRow: rowNum,
                                    deleteRows: anomaly.rows.filter(r => r !== rowNum)
                                  }
                                }));
                              }}
                            >
                              Keep Row {rowNum}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Import Report */}
            {importReport && (
              <div className="card">
                <h3 className="card-title" style={{ color: 'var(--success)' }}>
                  <CheckCircle2 size={18} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                  Import Execution Report
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  The CSV has been successfully processed and saved to the relational database.
                </p>

                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>CSV Row</th>
                        <th>Description</th>
                        <th>Import Action</th>
                        <th>Details / Resolution Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importReport.map((rep, idx) => (
                        <tr key={idx}>
                          <td>{rep.rowNum}</td>
                          <td>{rep.description}</td>
                          <td>
                            <span className={`badge ${rep.action === 'DELETED' || rep.action === 'SKIPPED' ? 'badge-high' : 'badge-low'}`}>
                              {rep.action}
                            </span>
                          </td>
                          <td>{rep.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add Shared Expense</h3>
              <button className="modal-close" onClick={() => setShowExpenseModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleExpenseSubmit}>
              <div className="form-group">
                <label>Description</label>
                <input 
                  type="text" 
                  className="form-control" 
                  required 
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="grid-cols-2" style={{ marginBottom: 0 }}>
                <div className="form-group">
                  <label>Payer</label>
                  <select 
                    className="form-control"
                    value={expenseForm.paidById}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, paidById: e.target.value }))}
                  >
                    {groupMembers.map(m => (
                      <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Amount</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    required 
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid-cols-2" style={{ marginBottom: 0 }}>
                <div className="form-group">
                  <label>Currency</label>
                  <select 
                    className="form-control"
                    value={expenseForm.currency}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, currency: e.target.value }))}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Split Type</label>
                  <select 
                    className="form-control"
                    value={expenseForm.splitType}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, splitType: e.target.value }))}
                  >
                    <option value="equal">Equal</option>
                    <option value="percentage">Percentage</option>
                    <option value="share">Share / Ratio</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Date</label>
                <input 
                  type="date" 
                  className="form-control" 
                  required 
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Split Details (Users)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {groupMembers.map((member) => {
                    const active = isMemberActiveOnDate(member, expenseForm.date);
                    return (
                      <div key={member.user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: active ? 1 : 0.5 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input 
                            type="checkbox"
                            disabled={!active}
                            id={`user-check-${member.user.id}`}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setExpenseForm(prev => {
                                const details = { ...prev.splitDetails };
                                if (checked) {
                                  details[member.user.id] = prev.splitType === 'equal' ? 0 : (details[member.user.id] || 1);
                                } else {
                                  delete details[member.user.id];
                                }
                                return { ...prev, splitDetails: details };
                              });
                            }}
                          />
                          {member.user.name} {!active && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(Inactive on this date)</span>}
                        </label>
                        {expenseForm.splitType !== 'equal' && active && (
                          <input 
                            type="number"
                            placeholder={expenseForm.splitType === 'percentage' ? '%' : 'share'}
                            className="form-control"
                            style={{ width: '80px', padding: '0.25rem 0.5rem' }}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setExpenseForm(prev => {
                                const details = { ...prev.splitDetails };
                                details[member.user.id] = val;
                                return { ...prev, splitDetails: details };
                              });
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button className="btn" style={{ width: '100%', marginTop: '1rem' }} type="submit">
                Add Expense
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Record Settlement Modal */}
      {showSettlementModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Record Settlement</h3>
              <button className="modal-close" onClick={() => setShowSettlementModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSettlementSubmit}>
              <div className="form-group">
                <label>Who Paid</label>
                <select 
                  className="form-control"
                  value={settlementForm.paidById}
                  onChange={(e) => setSettlementForm(prev => ({ ...prev, paidById: e.target.value }))}
                >
                  {groupMembers.map(m => (
                    <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Who Received</label>
                <select 
                  className="form-control"
                  value={settlementForm.receivedById}
                  onChange={(e) => setSettlementForm(prev => ({ ...prev, receivedById: e.target.value }))}
                >
                  {groupMembers.map(m => (
                    <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid-cols-2" style={{ marginBottom: 0 }}>
                <div className="form-group">
                  <label>Amount</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    required 
                    value={settlementForm.amount}
                    onChange={(e) => setSettlementForm(prev => ({ ...prev, amount: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label>Currency</label>
                  <select 
                    className="form-control"
                    value={settlementForm.currency}
                    onChange={(e) => setSettlementForm(prev => ({ ...prev, currency: e.target.value }))}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Date</label>
                <input 
                  type="date" 
                  className="form-control" 
                  required 
                  value={settlementForm.date}
                  onChange={(e) => setSettlementForm(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Notes</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={settlementForm.notes}
                  placeholder="e.g. Settle March Rent"
                  onChange={(e) => setSettlementForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <button className="btn" style={{ width: '100%', marginTop: '1rem' }} type="submit">
                Record Payment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showGroupModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create New Shared Group</h3>
              <button className="modal-close" onClick={() => setShowGroupModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleGroupSubmit}>
              <div className="form-group">
                <label>Group Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  required 
                  placeholder="e.g. Goa Trip 2026"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Description (Optional)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Shared expenses for our trip"
                  value={groupForm.description}
                  onChange={(e) => setGroupForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Associate Members & Timelines</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '200px', overflowY: 'auto', padding: '0.5rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--border-radius)' }}>
                  {users.map((u) => {
                    const isSelected = selectedGroupMembers[u.id] !== undefined;
                    return (
                      <div key={u.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSelectedGroupMembers(prev => {
                                const copy = { ...prev };
                                if (checked) {
                                  copy[u.id] = { userId: u.id, joinedAt: '', leftAt: '' };
                                } else {
                                  delete copy[u.id];
                                }
                                return copy;
                              });
                            }}
                          />
                          {u.name}
                        </label>
                        {isSelected && (
                          <div className="grid-cols-2" style={{ gap: '0.5rem', marginBottom: 0, marginTop: '0.25rem' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '0.75rem' }}>Joined Date</label>
                              <input 
                                type="date" 
                                className="form-control" 
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                value={selectedGroupMembers[u.id].joinedAt}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSelectedGroupMembers(prev => ({
                                    ...prev,
                                    [u.id]: { ...prev[u.id], joinedAt: val }
                                  }));
                                }}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '0.75rem' }}>Left Date</label>
                              <input 
                                type="date" 
                                className="form-control" 
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                value={selectedGroupMembers[u.id].leftAt}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSelectedGroupMembers(prev => ({
                                    ...prev,
                                    [u.id]: { ...prev[u.id], leftAt: val }
                                  }));
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button className="btn" style={{ width: '100%', marginTop: '1.5rem' }} type="submit">
                Create Group
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Manage Members & Timeline Modal */}
      {showMemberModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Manage Group Members</h3>
              <button className="modal-close" onClick={() => setShowMemberModal(false)}>&times;</button>
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <h4>Current Members</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                {groupMembers.map(m => (
                  <div key={m.user.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--border-radius)' }}>
                    <span style={{ fontWeight: 600 }}>{m.user.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {m.joinedAt ? 'In: ' + new Date(m.joinedAt).toISOString().split('T')[0] : 'Always'}
                      {m.leftAt ? ' | Out: ' + new Date(m.leftAt).toISOString().split('T')[0] : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleMemberSubmit} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <h4>Add / Update Member Timeline</h4>
              
              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Select User</label>
                <select 
                  className="form-control"
                  value={memberForm.userId}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, userId: e.target.value }))}
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid-cols-2" style={{ marginBottom: 0 }}>
                <div className="form-group">
                  <label>Joined Date (Optional)</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={memberForm.joinedAt}
                    onChange={(e) => setMemberForm(prev => ({ ...prev, joinedAt: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label>Left Date (Optional)</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={memberForm.leftAt}
                    onChange={(e) => setMemberForm(prev => ({ ...prev, leftAt: e.target.value }))}
                  />
                </div>
              </div>

              <button className="btn" style={{ width: '100%', marginTop: '1.5rem' }} type="submit">
                Add/Update Member Timeline
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Floating AI Assistant Button */}
      {isLoggedIn && (
        <button
          onClick={() => setChatOpen(!chatOpen)}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 40,
            padding: '1rem',
            backgroundColor: 'var(--success)',
            color: 'var(--bg-secondary)',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'var(--transition)'
          }}
          title="Ask AI Assistant"
        >
          {chatOpen ? <X size={24} /> : <Bot size={24} />}
        </button>
      )}

      {/* AI Assistant Drawer */}
      {isLoggedIn && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            height: '100%',
            width: '400px',
            maxWidth: '100vw',
            backgroundColor: 'var(--bg-secondary)',
            borderLeft: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 39,
            display: 'flex',
            flexDirection: 'column',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: chatOpen ? 'translateX(0)' : 'translateX(100%)'
          }}
        >
          {/* Header */}
          <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(110, 142, 117, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={16} color="var(--success)" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>SplitFlat AI Assistant</h3>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Powered by Gemini</span>
              </div>
            </div>
            <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-primary)' }}>
            {chatMessages.map((msg, idx) => {
              const isBot = msg.sender === 'bot';
              return (
                <div key={idx} style={{ display: 'flex', justifyContent: isBot ? 'flex-start' : 'flex-end' }}>
                  <div
                    style={{
                      maxWidth: '85%',
                      borderRadius: 'var(--border-radius)',
                      padding: '0.75rem 1rem',
                      fontSize: '0.85rem',
                      lineHeight: '1.5',
                      boxShadow: 'var(--shadow-sm)',
                      backgroundColor: isBot ? 'var(--bg-secondary)' : 'var(--accent-color)',
                      color: isBot ? 'var(--text-primary)' : 'var(--bg-secondary)',
                      border: isBot ? '1px solid var(--border-color)' : 'none',
                      borderTopLeftRadius: isBot ? '4px' : 'var(--border-radius)',
                      borderTopRightRadius: isBot ? 'var(--border-radius)' : '4px',
                      whiteSpace: 'pre-line'
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', borderTopLeftRadius: '4px', padding: '0.75rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--success)' }} />
                  Analyzing flat ledger...
                </div>
              </div>
            )}
          </div>

          {/* Input Form */}
          <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            {chatNeedsApiKey ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                if (chatInput.trim()) {
                  setChatApiKey(chatInput.trim());
                  setChatNeedsApiKey(false);
                  setChatInput('');
                  setChatMessages(prev => [...prev, { sender: 'bot', text: "API Key saved! Please ask your question again." }]);
                }
              }} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="password"
                  required
                  placeholder="Paste Gemini API Key here..."
                  className="form-control"
                  style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button type="submit" className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                  Save
                </button>
              </form>
            ) : (
              <form onSubmit={handleChatSend} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  required
                  placeholder="Ask anything about expenses..."
                  className="form-control"
                  style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={chatLoading}
                />
                <button type="submit" disabled={chatLoading} className="btn" style={{ padding: '0.5rem', width: '36px', height: '36px' }}>
                  <Send size={16} />
                </button>
              </form>
            )}
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
              Gemini model is active. AI responses may occasionally vary.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
