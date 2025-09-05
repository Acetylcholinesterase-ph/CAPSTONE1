class RecyclingApp {
    constructor() {
        this.currentTab = 'dashboard';
        this.currentUser = null;
        this.sessionToken = null;
        this.apiBaseUrl = 'http://localhost:3000/api';
        this.pendingStudentAccess = false;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkExistingSession();
        this.setActiveTab('dashboard');
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = e.target.getAttribute('data-tab');
                
                if (tab === 'student' && !this.currentUser) {
                    this.showLoginModal();
                    this.showMessage('Please login to access student portal', 'info');
                    this.pendingStudentAccess = true;
                    return;
                }
                
                this.setActiveTab(tab);
            });
        });

        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Modal close
        document.querySelector('.close').addEventListener('click', () => {
            this.hideLoginModal();
        });

        // Click outside modal to close
        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('login-modal')) {
                this.hideLoginModal();
            }
        });
    }

    setActiveTab(tabName) {
        if (tabName === 'student' && !this.currentUser) {
            this.showLoginModal();
            this.showMessage('Please login to access student portal', 'info');
            this.pendingStudentAccess = true;
            return;
        }
        
        this.currentTab = tabName;
        this.pendingStudentAccess = false;
        
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        document.getElementById(tabName).classList.add('active');
        
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`.nav-link[data-tab="${tabName}"]`).classList.add('active');
        
        if (tabName === 'dashboard') {
            this.loadDashboardData();
        } else if (tabName === 'student') {
            this.loadStudentData();
        } else if (tabName === 'admin') {
            this.loadAdminData();
        }
    }

    async handleLogin() {
        const username = document.getElementById('login-username').value;
        const pin = document.getElementById('login-pin').value;
        const messageDiv = document.getElementById('login-message');

        if (!username || !pin) {
            this.showMessage('Please fill in all fields', 'error', messageDiv);
            return;
        }

        if (pin.length !== 4) {
            this.showMessage('PIN must be 4 digits', 'error', messageDiv);
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    pin: pin,
                    ip: await this.getClientIP()
                })
            });

            const data = await response.json();

            if (data.success) {
                this.sessionToken = data.session_token;
                this.currentUser = data.user;
                
                localStorage.setItem('sessionToken', this.sessionToken);
                localStorage.setItem('userData', JSON.stringify(this.currentUser));
                
                this.updateUIAfterLogin();
                this.hideLoginModal();
                this.showMessage('Login successful!', 'success');
                
                if (this.pendingStudentAccess) {
                    this.setActiveTab('student');
                }
                
            } else {
                this.showMessage(data.error, 'error', messageDiv);
                
                if (data.locked_until) {
                    const lockTime = new Date(data.locked_until).toLocaleTimeString();
                    this.showMessage(`Account locked until ${lockTime}`, 'error', messageDiv);
                }
            }

        } catch (error) {
            console.error('Login error:', error);
            this.showMessage('Login failed. Please try again.', 'error', messageDiv);
        }
    }

    async checkExistingSession() {
        const savedToken = localStorage.getItem('sessionToken');
        const savedUser = localStorage.getItem('userData');

        if (savedToken && savedUser) {
            try {
                const response = await fetch(`${this.apiBaseUrl}/auth/verify-session`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ session_token: savedToken })
                });

                const data = await response.json();

                if (data.success) {
                    this.sessionToken = savedToken;
                    this.currentUser = JSON.parse(savedUser);
                    this.updateUIAfterLogin();
                } else {
                    this.clearSession();
                }

            } catch (error) {
                console.error('Session verification error:', error);
                this.clearSession();
            }
        }
    }

    updateUIAfterLogin() {
        document.getElementById('user-greeting').textContent = `Welcome, ${this.currentUser.name}`;
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'block';
        
        // Load leaderboard on dashboard
        if (this.currentTab === 'dashboard') {
            this.loadLeaderboard();
        }
        
        // Load student data if on student portal
        if (this.currentTab === 'student') {
            this.loadStudentData();
        }
    }

    async loadDashboardData() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/monitoring/machine-stats`);
            const data = await response.json();
            
            if (data.length > 0) {
                const machine = data[0];
                document.getElementById('total-bottles').textContent = machine.total_bottles.toLocaleString();
                document.getElementById('total-points').textContent = machine.total_points.toLocaleString();
                document.getElementById('active-users').textContent = Math.floor(machine.total_bottles / 10).toLocaleString();
            }
            
            // Load leaderboard if user is logged in
            if (this.currentUser) {
                this.loadLeaderboard();
            }
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    async loadLeaderboard() {
        try {
            // Always fetch top 10
            const topResponse = await fetch(`${this.apiBaseUrl}/leaderboard/top`);
            const topPlayers = await topResponse.json();

            let userRank = null;
            let aroundMe = [];

            if (this.currentUser) {
                // Fetch user rank and around-me only if logged in
                const [userRankResponse, aroundMeResponse] = await Promise.all([
                    fetch(`${this.apiBaseUrl}/leaderboard/my-rank`, {
                        headers: { 'Authorization': `Bearer ${this.sessionToken}` }
                    }),
                    fetch(`${this.apiBaseUrl}/leaderboard/around-me`, {
                        headers: { 'Authorization': `Bearer ${this.sessionToken}` }
                    })
                ]);
                userRank = await userRankResponse.json();
                aroundMe = await aroundMeResponse.json();
            }

            this.renderLeaderboard(topPlayers, userRank, aroundMe);

        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.showMessage('Error loading leaderboard', 'error');
        }
    }

    renderLeaderboard(topPlayers, userRank, aroundMe) {
        const container = document.getElementById('leaderboard-container');
        let html = `
            <div class="leaderboard">
                <div class="leaderboard-header">
                    <h3>Top 10 Recyclers</h3>
                </div>
        `;

        // Top 10 leaderboard (highlight if logged in and in top 10)
        topPlayers.forEach((player, index) => {
            const isCurrentUser = this.currentUser && player.student_id === this.currentUser.student_id;
            html += `
                <div class="leaderboard-item ${isCurrentUser ? 'current-user' : ''}">
                    <div class="leaderboard-rank rank-${index + 1}">${index + 1}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${player.name}</div>
                        <div class="leaderboard-stats">
                            <span class="leaderboard-bottles">${player.total_bottles} bottles</span>
                            <span class="leaderboard-points">${player.total_points} points</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;

        // Show user's own rank if logged in and not in top 10
        const userRankContainer = document.getElementById('user-rank-container');
        if (
            this.currentUser &&
            userRank &&
            userRank.rank !== 'N/A' &&
            userRank.rank > 10
        ) {
            userRankContainer.style.display = 'block';
            userRankContainer.innerHTML = `
                <div class="user-rank-card">
                    <h3>Your Ranking</h3>
                    <div class="user-rank-number">#${userRank.rank}</div>
                    <div class="user-rank-stats">
                        <div class="user-stat">
                            <span class="user-stat-number">${userRank.total_bottles}</span>
                            <span class="user-stat-label">Bottles</span>
                        </div>
                        <div class="user-stat">
                            <span class="user-stat-number">${userRank.total_points}</span>
                            <span class="user-stat-label">Points</span>
                        </div>
                        <div class="user-stat">
                            <span class="user-stat-number">${userRank.rank}</span>
                            <span class="user-stat-label">Rank</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            userRankContainer.style.display = 'none';
            userRankContainer.innerHTML = '';
        }

        container.innerHTML = html;
    }

    async loadStudentData() {
        if (!this.currentUser) {
            document.getElementById('student-info').innerHTML = `
                <div class="login-prompt">
                    <h2>🔐 Login Required</h2>
                    <p>Please login to view your student information</p>
                    <button onclick="window.recyclingApp.showLoginModal()" class="btn-primary">
                        Login Now
                    </button>
                </div>
            `;
            return;
        }

        try {
            this.showLoading('student-info', 'Loading your data...');
            
            const [studentResponse, codesResponse, couponsResponse] = await Promise.all([
                fetch(`${this.apiBaseUrl}/student/rfid/${this.currentUser.rfid_id}`, {
                    headers: { 'Authorization': `Bearer ${this.sessionToken}` }
                }),
                fetch(`${this.apiBaseUrl}/student/${this.currentUser.rfid_id}/codes`, {
                    headers: { 'Authorization': `Bearer ${this.sessionToken}` }
                }),
                fetch(`${this.apiBaseUrl}/redemption/coupons`)
            ]);
            
            if (!studentResponse.ok) throw new Error('Failed to fetch student data');
            
            const studentData = await studentResponse.json();
            const codesData = await codesResponse.ok ? await codesResponse.json() : [];
            const couponsData = await couponsResponse.ok ? await couponsResponse.json() : [];
            
            this.renderStudentInfo(studentData);
            this.renderRedemptionCodes(codesData);
            this.renderAvailableCoupons(couponsData, studentData.total_points);
            
        } catch (error) {
            console.error('Error loading student data:', error);
            this.showMessage('Error loading your data. Please try again.', 'error');
            document.getElementById('student-info').innerHTML = '';
            document.getElementById('redemption-codes').innerHTML = '';
        }
    }

    renderStudentInfo(studentData) {
        const studentInfoDiv = document.getElementById('student-info');
        studentInfoDiv.innerHTML = `
            <div class="student-info">
                <h2>👤 ${studentData.name}</h2>
                <div class="student-details">
                    <p><strong>🎫 Student ID:</strong> ${studentData.student_id}</p>
                    <p><strong>💰 Total Points:</strong> ${(studentData.total_points || 0).toLocaleString()}</p>
                    <p><strong>♻️ Bottles Recycled:</strong> ${(studentData.total_bottles || 0).toLocaleString()}</p>
                    <p><strong>📅 Member Since:</strong> ${new Date(studentData.created_at).toLocaleDateString()}</p>
                    ${studentData.last_login ? `<p><strong>⏰ Last Login:</strong> ${new Date(studentData.last_login).toLocaleString()}</p>` : ''}
                </div>
            </div>
        `;
    }

    renderRedemptionCodes(codes) {
        const codesDiv = document.getElementById('redemption-codes');
        
        if (codes.length === 0) {
            codesDiv.innerHTML = `
                <div class="no-codes-message">
                    <h3>🎫 No Active Redemption Codes</h3>
                    <p>Recycle more bottles to earn rewards!</p>
                </div>
            `;
            return;
        }
        
        codesDiv.innerHTML = `
            <h2 class="section-title">🎫 Active Redemption Codes</h2>
            <div class="codes-grid">
                ${codes.map(code => `
                    <div class="code-card">
                        <div class="code-header">
                            <h4>${code.coupon_name}</h4>
                            <span class="status-badge ${code.status}">${code.status}</span>
                        </div>
                        <div class="code-body">
                            <p><strong>🔒 Code:</strong> <code class="redemption-code">${code.redemption_code}</code></p>
                            <p><strong>⏰ Expires:</strong> ${new Date(code.expiry_date).toLocaleDateString()}</p>
                            <p><strong>💰 Value:</strong> ${this.getCouponValue(code.coupon_name)}</p>
                        </div>
                        <div class="code-actions">
                            <button onclick="copyToClipboard('${code.redemption_code}')" class="copy-btn">
                                📋 Copy Code
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async renderAvailableCoupons(coupons, userPoints) {
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="card">
                <h2>🎁 Available Rewards</h2>
                <p>Redeem your points for exciting rewards!</p>
                <div class="coupon-grid" id="available-coupons">
                    ${coupons.map(coupon => `
                        <div class="coupon-card ${coupon.points_required > 100 ? 'premium' : ''}">
                            <div class="coupon-header">
                                <h3 class="coupon-title">${coupon.coupon_name}</h3>
                                <span class="coupon-points">${coupon.points_required} pts</span>
                            </div>
                            <div class="coupon-body">
                                <p class="coupon-description">${coupon.description}</p>
                                <p class="coupon-value">🎯 ${coupon.coupon_value}</p>
                                <p class="coupon-validity">Valid for ${coupon.validity_days} days</p>
                            </div>
                            <div class="coupon-actions">
                                <button class="redeem-btn" onclick="redeemCoupon(${coupon.id}, ${coupon.points_required}, '${coupon.coupon_name}')" 
                                    ${userPoints < coupon.points_required ? 'disabled' : ''}>
                                    🎫 Redeem Now
                                </button>
                                ${userPoints < coupon.points_required ? 
                                    `<p class="insufficient-points">Need ${coupon.points_required - userPoints} more points</p>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        document.getElementById('redemption-codes').appendChild(container);
    }

    async loadAdminData() {
        try {
            const [statsResponse, activitiesResponse] = await Promise.all([
                fetch(`${this.apiBaseUrl}/monitoring/machine-stats`),
                fetch(`${this.apiBaseUrl}/monitoring/suspicious-activities`)
            ]);
            
            const statsData = await statsResponse.json();
            const activitiesData = await activitiesResponse.json();
            
            this.renderMachineStats(statsData);
            this.renderSuspiciousActivities(activitiesData);
            
        } catch (error) {
            console.error('Error loading admin data:', error);
            this.showMessage('Error loading admin data', 'error');
        }
    }

    renderMachineStats(stats) {
        const statsDiv = document.getElementById('machine-stats');
        
        statsDiv.innerHTML = stats.map(machine => `
            <div class="stat-card">
                <h3>${machine.machine_id}</h3>
                <p>${machine.total_bottles.toLocaleString()}</p>
                <small>Bottles Collected</small>
            </div>
            <div class="stat-card">
                <h3>${machine.total_points.toLocaleString()}</h3>
                <small>Points Distributed</small>
            </div>
            <div class="stat-card">
                <h3>${machine.suspicious_count}</h3>
                <small>Suspicious Activities</small>
            </div>
        `).join('');
    }

    renderSuspiciousActivities(activities) {
        const tbody = document.getElementById('suspicious-activities-body');
        
        if (activities.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="no-data">No suspicious activities found</td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = activities.map(activity => `
            <tr>
                <td><strong>${activity.name}</strong><br><small>${activity.student_id}</small></td>
                <td>${new Date(activity.insertion_time).toLocaleString()}</td>
                <td>${activity.bottles_inserted}</td>
                <td><span class="status-badge">${activity.status}</span></td>
                <td>${activity.suspicion_reason || 'N/A'}</td>
            </tr>
        `).join('');
    }

    getCouponValue(couponName) {
        const values = {
            'Coffee Discount': '20% OFF Coffee',
            'Free Snack': 'FREE Snack',
            'Canteen Discount': '15% OFF Food',
            'Stationery Set': 'FREE Stationery Set'
        };
        return values[couponName] || 'Reward';
    }

    showLoginModal() {
        document.getElementById('login-modal').style.display = 'block';
    }

    hideLoginModal() {
        document.getElementById('login-modal').style.display = 'none';
        document.getElementById('login-message').innerHTML = '';
        document.getElementById('login-form').reset();
    }

    showLoading(containerId, message = 'Loading...') {
        const container = document.getElementById(containerId);
        container.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    showMessage(message, type = 'success', element = null) {
        const targetElement = element || document.getElementById(this.currentTab);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        
        if (element) {
            element.innerHTML = '';
            element.appendChild(messageDiv);
        } else {
            targetElement.insertBefore(messageDiv, targetElement.firstChild);
        }
        
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }

    async getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'unknown';
        }
    }

    async logout() {
        try {
            await fetch(`${this.apiBaseUrl}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ session_token: this.sessionToken })
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearSession();
        }
    }

    clearSession() {
        this.sessionToken = null;
        this.currentUser = null;
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('userData');
        
        document.getElementById('user-greeting').textContent = 'Welcome, Guest';
        document.getElementById('login-btn').style.display = 'block';
        document.getElementById('logout-btn').style.display = 'none';
        
        if (this.currentTab === 'student') {
            this.loadStudentData();
        }
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        if (window.recyclingApp) {
            window.recyclingApp.showMessage('Code copied to clipboard!', 'success');
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

async function redeemCoupon(couponId, pointsRequired, couponName) {
    if (!window.recyclingApp.currentUser) {
        window.recyclingApp.showMessage('Please login to redeem coupons', 'error');
        return;
    }

    if (!confirm(`Redeem ${pointsRequired} points for ${couponName}?`)) {
        return;
    }

    try {
        const response = await fetch(`${window.recyclingApp.apiBaseUrl}/redemption/redeem`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.recyclingApp.sessionToken}`
            },
            body: JSON.stringify({
                rfid: window.recyclingApp.currentUser.rfid_id,
                coupon_id: couponId
            })
        });

        const data = await response.json();

        if (data.success) {
            window.recyclingApp.showMessage(`Success! Your redemption code: ${data.code}`, 'success');
            // Reload student data to refresh points and codes
            window.recyclingApp.loadStudentData();
            // Reload leaderboard
            if (window.recyclingApp.currentTab === 'dashboard') {
                window.recyclingApp.loadLeaderboard();
            }
        } else {
            window.recyclingApp.showMessage(data.error, 'error');
        }

    } catch (error) {
        console.error('Error redeeming coupon:', error);
        window.recyclingApp.showMessage('Error redeeming coupon', 'error');
    }
}

function logout() {
    if (window.recyclingApp) {
        window.recyclingApp.logout();
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    const app = new RecyclingApp();
    window.recyclingApp = app;
    
    // Simulate API for demo (remove in production)
    window.simulateAPI = function() {
        const mockAPIs = {
            '/api/monitoring/machine-stats': [{
                machine_id: 'machine_001',
                total_operations: 150,
                total_bottles: 1250,
                total_points: 12500,
                suspicious_count: 3,
                last_activity: new Date().toISOString()
            }],
            
            '/api/student/id/STU2024001': {
                rfid_id: 'A1B2C3D4E5',
                name: 'John Doe',
                student_id: 'STU2024001',
                email: 'john.doe@university.edu',
                total_points: 150,
                total_bottles: 15,
                created_at: new Date().toISOString(),
                last_login: new Date().toISOString()
            },
            
            '/api/student/A1B2C3D4E5/codes': [{
                redemption_code: 'COFFEE123',
                coupon_name: 'Coffee Discount',
                status: 'active',
                expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            }],
            
            '/api/monitoring/suspicious-activities': [{
                id: 1,
                name: 'John Doe',
                student_id: 'STU2024001',
                insertion_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                bottles_inserted: 5,
                status: 'suspicious',
                suspicion_reason: 'Rapid insertions detected'
            }],
            
            '/api/leaderboard/top': [
                { name: 'Eco Warrior', student_id: 'STU2024005', total_bottles: 245, total_points: 2450 },
                { name: 'Green Champion', student_id: 'STU2024002', total_bottles: 198, total_points: 1980 },
                { name: 'Recycle Master', student_id: 'STU2024007', total_bottles: 176, total_points: 1760 },
                { name: 'John Doe', student_id: 'STU2024001', total_bottles: 150, total_points: 1500 },
                { name: 'Eco Friend', student_id: 'STU2024009', total_bottles: 132, total_points: 1320 },
                { name: 'Planet Saver', student_id: 'STU2024003', total_bottles: 121, total_points: 1210 },
                { name: 'Green Hero', student_id: 'STU2024008', total_bottles: 98, total_points: 980 },
                { name: 'Eco Advocate', student_id: 'STU2024004', total_bottles: 87, total_points: 870 },
                { name: 'Sustainability Guru', student_id: 'STU2024006', total_bottles: 76, total_points: 760 },
                { name: 'Environment Ally', student_id: 'STU2024010', total_bottles: 65, total_points: 650 }
            ],
            
            '/api/leaderboard/my-rank': {
                rank: 4,
                total_bottles: 150,
                total_points: 1500
            },
            
            '/api/leaderboard/around-me': [
                { position: 2, name: 'Green Champion', student_id: 'STU2024002', total_bottles: 198, total_points: 1980 },
                { position: 3, name: 'Recycle Master', student_id: 'STU2024007', total_bottles: 176, total_points: 1760 },
                { position: 4, name: 'John Doe', student_id: 'STU2024001', total_bottles: 150, total_points: 1500 },
                { position: 5, name: 'Eco Friend', student_id: 'STU2024009', total_bottles: 132, total_points: 1320 },
                { position: 6, name: 'Planet Saver', student_id: 'STU2024003', total_bottles: 121, total_points: 1210 }
            ],
            
            '/api/redemption/coupons': [
                {
                    id: 1,
                    coupon_name: "Coffee Discount",
                    description: "Get 20% off on any coffee at campus cafe",
                    points_required: 50,
                    coupon_value: "20% OFF",
                    validity_days: 30
                },
                {
                    id: 2,
                    coupon_name: "Free Snack",
                    description: "Enjoy a free snack from the vending machine",
                    points_required: 100,
                    coupon_value: "FREE Snack",
                    validity_days: 30
                },
                {
                    id: 3,
                    coupon_name: "Canteen Discount",
                    description: "15% discount on any meal at the campus canteen",
                    points_required: 150,
                    coupon_value: "15% OFF",
                    validity_days: 30
                },
                {
                    id: 4,
                    coupon_name: "Stationery Set",
                    description: "Eco-friendly stationery set",
                    points_required: 200,
                    coupon_value: "FREE Set",
                    validity_days: 60
                }
            ]
        };
        
        const originalFetch = window.fetch;
        window.fetch = async function(url) {
            if (mockAPIs[url]) {
                return {
                    ok: true,
                    json: async () => mockAPIs[url],
                    text: async () => JSON.stringify(mockAPIs[url])
                };
            }
            return originalFetch.apply(this, arguments);
        };
    };
});