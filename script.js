// Second Brain — Main App Logic (Supabase + Claude integrated)

class SecondBrain {
    constructor() {
        this.currentUser = null;
        this.entries = [];
        this.patterns = {};
        this.charts = {};
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateDateTime();
        this.checkExistingSession();
    }

    // ── Session ───────────────────────────────────────

    async checkExistingSession() {
        const user = await getUser();
        if (user) {
            this.currentUser = user;
            await this.loadEntries();
            this.showScreen('dashboardScreen');
            this.updateDashboard();
        }
    }

    // ── Event Listeners ───────────────────────────────
    // FIX #1: Removed the DOMContentLoaded wrapper — by the time this script
    // runs the DOM is already parsed, so the inner callback never fired before.

    setupEventListeners() {
        const logForm = document.getElementById('logForm');
        if (logForm) {
            logForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveLogEntry();
            });
        }

        const moodButtons = document.querySelectorAll('.mood-btn');
        moodButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                moodButtons.forEach(b => b.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
            });
        });

        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }
    }

    // ── Auth ──────────────────────────────────────────

    async startApp() {
        const emailInput = document.getElementById('username');
        const email = emailInput.value.trim();

        if (!email) {
            this.showNotification('Please enter your email', 'error');
            return;
        }

        this.showNotification('Signing you in…', 'info');

        // FIX #2: Check data.session (not data.user) — signUp returns a user
        // object even when email is unconfirmed, so data.user was always truthy
        // and the code never fell through to logIn for returning users.
        let data = await signUp(email, 'secondbrain123');

        if (!data || !data.session) {
            // Already registered — try logging in
            data = await logIn(email, 'secondbrain123');
        }

        if (data && (data.session || data.user)) {
            this.currentUser = data.user || data.session.user;
            await this.loadEntries();
            this.showScreen('dashboardScreen');
            this.updateDashboard();
            this.showNotification('Welcome to your Second Brain!', 'success');
        } else {
            this.showNotification('Could not sign in. Check console for errors.', 'error');
        }
    }

    // ── Data ──────────────────────────────────────────

    async loadEntries() {
        this.entries = await fetchLogs();
        if (this.entries.length === 0) {
            await this.initializeSampleData();
        }
    }

    async initializeSampleData() {
        const samples = [
            { text: 'Been thinking about starting that project again...', type: 'thought' },
            { text: 'Decided to wake up 30 minutes earlier to exercise', type: 'decision' },
            { text: 'Procrastinated on the important presentation until last minute', type: 'mistake' },
            { text: 'Completed the project ahead of schedule!', type: 'win' },
            { text: 'Feeling more productive when I start the day with planning', type: 'thought' }
        ];

        for (const s of samples) {
            await saveLog(s.text, s.type);
        }

        this.entries = await fetchLogs();
    }

    // ── Screen Management ─────────────────────────────

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`[onclick="showScreen('${screenId}')"]`);
        if (activeBtn) activeBtn.classList.add('active');

        if (screenId === 'dashboardScreen') this.updateDashboard();
        if (screenId === 'insightsScreen') this.updateInsights();
    }

    // ── Dashboard ─────────────────────────────────────

    updateDashboard() {
        if (!this.currentUser) return;
        this.updateDateTime();
        this.updatePatternInsights();
        this.generateDailyInsight();
    }

    updateDateTime() {
        const el = document.getElementById('currentDateTime');
        if (el) {
            el.textContent = new Date().toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long',
                day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        }
    }

    updatePatternInsights() {
        const p = this.analyzePatterns();
        const streak = document.getElementById('currentStreak');
        const peak = document.getElementById('peakTime');
        const proc = document.getElementById('procrastinationLevel');
        if (streak) streak.textContent = `${p.currentStreak || 0} days`;
        if (peak) peak.textContent = p.peakProductivity || 'Morning';
        if (proc) proc.textContent = p.procrastinationLevel || 'Low';
    }

    generateDailyInsight() {
        const insights = [
            "You're most productive when you start your day with clear intentions.",
            "Your past shows that consistency beats intensity every time.",
            "Small daily actions lead to big results.",
            "You tend to make better decisions in the morning hours.",
            "Your future self wants you to focus on what matters most today."
        ];
        const el = document.getElementById('dailyInsight');
        if (el) el.textContent = insights[Math.floor(Math.random() * insights.length)];
    }

    // ── Pattern Analysis ──────────────────────────────

    analyzePatterns() {
        if (!this.entries || this.entries.length === 0) {
            return { peakProductivity: 'Morning', currentStreak: 0, procrastinationLevel: 'Low', moodTrend: 'Stable', habitBreakPoint: 'Day 3', avoidanceRate: 'Low' };
        }

        const patterns = {};
        const hourCounts = {};

        this.entries.forEach(entry => {
            const hour = new Date(entry.created_at).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        const peakHour = Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b);
        patterns.peakProductivity = this.getTimeOfDay(parseInt(peakHour));
        patterns.currentStreak = this.calculateStreak();

        const mistakes = this.entries.filter(e => e.type === 'mistake');
        patterns.procrastinationLevel = mistakes.length > 3 ? 'High' : mistakes.length > 1 ? 'Medium' : 'Low';
        patterns.moodTrend = 'Stable';
        patterns.habitBreakPoint = 'Day 3';
        patterns.avoidanceRate = 'Low';

        return patterns;
    }

    getTimeOfDay(hour) {
        if (hour >= 5 && hour < 12) return 'Morning';
        if (hour >= 12 && hour < 17) return 'Afternoon';
        if (hour >= 17 && hour < 21) return 'Evening';
        return 'Night';
    }

    calculateStreak() {
        if (!this.entries.length) return 0;
        let streak = 0;
        const today = new Date(); today.setHours(0,0,0,0);
        let check = new Date(today);

        for (let i = 0; i < 30; i++) {
            const hasEntry = this.entries.some(e => {
                const d = new Date(e.created_at); d.setHours(0,0,0,0);
                return d.getTime() === check.getTime();
            });
            if (hasEntry) { streak++; check.setDate(check.getDate() - 1); }
            else if (i === 0) { check.setDate(check.getDate() - 1); }
            else break;
        }
        return streak;
    }

    // ── Log Entry ─────────────────────────────────────

    async saveLogEntry() {
        const type = document.getElementById('entryType').value;
        const content = document.getElementById('entryContent').value.trim();
        const selectedMood = document.querySelector('.mood-btn.selected');

        if (!content) { this.showNotification('Please describe what happened', 'error'); return; }
        if (!selectedMood) { this.showNotification('Please select your mood', 'error'); return; }

        await saveLog(content, type);
        this.entries = await fetchLogs();

        document.getElementById('entryContent').value = '';
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));

        this.showNotification('Entry saved!', 'success');
        this.showScreen('dashboardScreen');
    }

    // ── Chat / Future Self ────────────────────────────

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        if (!message) return;

        this.addChatMessage(message, 'user');
        input.value = '';

        // Show typing indicator
        const typingId = 'typing-' + Date.now();
        this.addTypingIndicator(typingId);

        try {
            const reply = await askFutureSelf(message);
            const typingEl = document.getElementById(typingId);
            if (typingEl) {
                typingEl.innerHTML = reply;
            }
        } catch (e) {
            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.textContent = "Couldn't reach future self. Try again.";
        }
    }

    addChatMessage(message, sender) {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = `msg ${sender}`;
        div.textContent = message;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    addTypingIndicator(id) {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'msg ai';
        div.id = id;
        div.innerHTML = `<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    // ── Insights ──────────────────────────────────────

    updateInsights() {
        const p = this.analyzePatterns();

        const timeIns = document.getElementById('timeInsight');
        const moodIns = document.getElementById('moodInsight');
        const avoid = document.getElementById('avoidanceRate');
        const habitBp = document.getElementById('habitBreakPoint');
        const winRate = document.getElementById('winRate');
        const bestDay = document.getElementById('bestDay');
        const longestStreak = document.getElementById('longestStreak');

        if (timeIns) timeIns.textContent = `You are most productive in the ${p.peakProductivity.toLowerCase()} hours.`;
        if (moodIns) moodIns.textContent = `Your mood trend is ${p.moodTrend.toLowerCase()}.`;
        if (avoid) avoid.textContent = p.avoidanceRate;
        if (habitBp) habitBp.textContent = p.habitBreakPoint;
        if (winRate) winRate.textContent = `${this.calculateWinRate()}%`;
        if (bestDay) bestDay.textContent = this.findBestDay();
        if (longestStreak) longestStreak.textContent = `${this.findLongestStreak()} days`;

        this.createTimeChart();
        this.createMoodChart();
    }

    calculateWinRate() {
        if (!this.entries.length) return 0;
        return Math.round((this.entries.filter(e => e.type === 'win').length / this.entries.length) * 100);
    }

    findBestDay() {
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const counts = {};
        this.entries.forEach(e => {
            const d = days[new Date(e.created_at).getDay()];
            counts[d] = (counts[d] || 0) + 1;
        });
        return Object.keys(counts).length ? Object.keys(counts).reduce((a,b) => counts[a] > counts[b] ? a : b) : 'Wednesday';
    }

    findLongestStreak() { return Math.max(7, this.entries.length); }

    createTimeChart() {
        const ctx = document.getElementById('timeChart');
        if (!ctx) return;
        if (this.charts.time) this.charts.time.destroy();

        const hourData = new Array(24).fill(0);
        this.entries.forEach(e => { hourData[new Date(e.created_at).getHours()]++; });

        this.charts.time = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({length: 24}, (_, i) => `${i}:00`),
                datasets: [{ label: 'Activity', data: hourData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', tension: 0.4 }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#a0a0a0' }, grid: { color: 'rgba(255,255,255,0.1)' } }, x: { ticks: { color: '#a0a0a0' }, grid: { color: 'rgba(255,255,255,0.1)' } } } }
        });
    }

    createMoodChart() {
        const ctx = document.getElementById('moodChart');
        if (!ctx) return;
        if (this.charts.mood) this.charts.mood.destroy();

        this.charts.mood = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Mistake', 'Decision', 'Thought', 'Win'],
                datasets: [{ data: ['mistake','decision','thought','win'].map(t => this.entries.filter(e => e.type === t).length), backgroundColor: ['#ef4444','#f59e0b','#6b7280','#10b981'] }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#a0a0a0' } } } }
        });
    }

    // ── Notifications ─────────────────────────────────

    showNotification(message, type = 'info') {
        const n = document.createElement('div');
        n.textContent = message;
        n.style.cssText = `position:fixed;top:20px;right:20px;padding:1rem 1.5rem;border-radius:0.5rem;color:white;font-weight:500;z-index:10000;animation:slideIn 0.3s ease-out;background:${type==='success'?'#10b981':type==='error'?'#ef4444':'#6366f1'}`;
        document.body.appendChild(n);
        setTimeout(() => { n.style.opacity='0'; setTimeout(() => n.remove(), 300); }, 3000);
    }
}

// ── Global handlers for HTML onclick ─────────────────

function showScreen(id) { app.showScreen(id); }
function startApp() { app.startApp(); }
function sendMessage() { app.sendMessage(); }

const app = new SecondBrain();

const style = document.createElement('style');
style.textContent = `@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`;
document.head.appendChild(style);