class RecyclingApp {
    constructor() {
        this.currentTab = 'dashboard';
        this.currentUser = null;
        this.sessionToken = null;
        this.apiBaseUrl = 'http://localhost:3000/api';
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkExistingSession();
        this.setActiveTab('dashboard');
    }

    setupEventListeners() {
        // Tab navigation with login check
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = e.target.getAttribute('data-tab');
                
                // Check if student portal requires login
                if (tab === 'student' && !this.currentUser) {
                    this.showLoginModal();
                    this.showMessage('Please login to access student portal', 'info');
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
        // Check if student portal requires login
        if (tabName === 'student' && !this.currentUser) {
            this.showLoginModal();
            this.showMessage('Please login to access student portal', 'info');
            return;
        }
        
        this.currentTab = tabName;
        
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Show active tab
        document.getElementById(tabName).classList.add('active');
        
        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`.nav-link[data-tab="${tabName}"]`).classList.add('active');
        
        // Load data for the active tab
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
                
                // Store session in localStorage
                localStorage.setItem('sessionToken', this.sessionToken);
                localStorage.setItem('userData', JSON.stringify(this.currentUser));
                
                this.updateUIAfterLogin();
                this.hideLoginModal();
                this.showMessage('Login successful!', 'success');
                
                // If user was trying to access student portal, switch to it
                if (this.currentTab === 'student' || this.pendingStudentAccess) {
                    this.setActiveTab('student');
                    this.pendingStudentAccess = false;
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

    // Add this method to handle student data loading
    async loadStudentData() {
        if (!this.currentUser) {
            this.showLoginModal();
            this.showMessage('Please login to view your data', 'info');
            return;
        }

        try {
            this.showLoading('student-info', 'Loading your data...');
            
            // Fetch student details
            const studentResponse = await fetch(`${this.apiBaseUrl}/student/rfid/${this.currentUser.rfid_id}`, {
                headers: {
                    'Authorization': `Bearer ${this.sessionToken}`
                }
            });
            
            if (!studentResponse.ok) {
                throw new Error('Failed to fetch student data');
            }
            
            const studentData = await studentResponse.json();
            
            // Fetch redemption codes
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
            
            // Clear loading state
            document.getElementById('student-info').innerHTML = '';
            document.getElementById('redemption-codes').innerHTML = '';
        }
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

    // Update the renderStudentInfo method
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

    // Update the renderRedemptionCodes method
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

    getCouponValue(couponName) {
        const values = {
            'Coffee Discount': '20% OFF Coffee',
            'Free Snack': 'FREE Snack',
            'Canteen Discount': '15% OFF Food',
            'Stationery Set': 'FREE Stationery Set'
        };
        return values[couponName] || 'Reward';
    }
}

// Add copy to clipboard function
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        if (window.recyclingApp) {
            window.recyclingApp.showMessage('Code copied to clipboard!', 'success');
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// Make logout function globally available
function logout() {
    if (window.recyclingApp) {
        window.recyclingApp.logout();
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    const app = new RecyclingApp();
    window.recyclingApp = app;
});