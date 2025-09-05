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
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
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
            
            const studentResponse = await fetch(`${this.apiBaseUrl}/student/rfid/${this.currentUser.rfid_id}`, {
                headers: {
                    'Authorization': `Bearer ${this.sessionToken}`
                }
            });
            
            if (!studentResponse.ok) {
                throw new Error('Failed to fetch student data');
            }
            
            const studentData = await studentResponse.json();
            
            const codesResponse = await fetch(`${this.apiBaseUrl}/student/${this.currentUser.rfid_id}/codes`, {
                headers: {
                    'Authorization': `Bearer ${this.sessionToken}`
                }
            });
            
            const codesData = await codesResponse.ok ? await codesResponse.json() : [];
            
            this.renderStudentInfo(studentData);
            this.renderRedemptionCodes(codesData);
            
        } catch (error) {
            console.error('Error loading student data:', error);
            this.showMessage('Error loading your data. Please try again.', 'error');
            document.getElementById('student-info').innerHTML = '';
            document.getElementById('redemption-codes').innerHTML = '';
        }
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
            }]
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
// Uncomment to simulate API responses for demo purposes
// window.simulateAPI();