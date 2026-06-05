/**
 * RealPhone POS — Punto de Venta Celulares y Tecnología
 * app.js — Lógica principal con atajos de teclado e inventario Excel
 */

(function () {

    // ==================== DATOS INICIALES ====================
    const defaultUsers = [
        { id: 'u1', username: 'admin',   password: '1234', role: 'admin',   fullName: 'Administrador Principal',  branch: 'principal', active: true },
        { id: 'u2', username: 'gerente', password: '1234', role: 'gerente', fullName: 'Gerente de Sucursal',      branch: 'sucursal1', active: true },
        { id: 'u3', username: 'cajero',  password: '1234', role: 'cajero',  fullName: 'Cajero Demo',              branch: 'principal', active: true }
    ];

    const defaultProducts = [
        { id: 'p1', sku: 'FUNDA-001', name: 'Funda Genérica para Celular',      category: 'fundas', cost: 30,  price: 99,   stock: 50 },
        { id: 'p2', sku: 'MICA-001',  name: 'Mica Normal Cristal Templado',     category: 'micas',  cost: 15,  price: 49,   stock: 100 }
    ];

    const STORE_ADDRESSES = {
        "Matriz": "Lázaro Cárdenas 179 Col. Centro",
        "Sunny": "53 Príncipe Tacámba Col. Centro",
        "Hospital": "99 Álvaro Obregón Col. Centro",
        "David": "Av. Madero Oriente Col. Centro",
        "Portal": "34 Portal Nicolás de Regulés Col. Centro",
        "Coppel": "486 Lic. Isidro Favela Col. Los Pinos"
    };

    // ==================== ESTADO GLOBAL ====================
    let users         = [];
    let products      = [];
    let salesHistory  = [];
    let categories    = []; // { id, name }
    let currentUser   = null;
    let currentUser2  = null;
    let currentBranch = localStorage.getItem('realphone_current_store') || '';
    let ticketItems   = [];
    let ticketCounter = 1;
    let activeCategory = 'todas';
    let pendingImportData = [];
    let selectedExportType = 'full';

    const defaultCategories = [
        { id: 'fundas',  name: '🛡️ Fundas' },
        { id: 'micas',   name: '📱 Micas'  },
        { id: 'otros',   name: '📦 Otros'  }
    ];

    // ==================== PERSISTENCIA ====================
    const DATA_VERSION = '3.0'; // Cambiar para forzar reset de inventario

    function loadData() {
        try {
            const savedVersion = localStorage.getItem('realphone_version');
            if (savedVersion !== DATA_VERSION) {
                console.log('Datos actualizados a versión ' + DATA_VERSION + '. Reseteando inventario...');
                users        = structuredClone(defaultUsers);
                products     = structuredClone(defaultProducts);
                salesHistory = [];
                categories   = structuredClone(defaultCategories);
                localStorage.setItem('realphone_version', DATA_VERSION);
                saveData();
                return;
            }
            users        = JSON.parse(localStorage.getItem('realphone_users'))      || structuredClone(defaultUsers);
            products     = JSON.parse(localStorage.getItem('realphone_products'))   || structuredClone(defaultProducts);
            salesHistory = JSON.parse(localStorage.getItem('realphone_sales'))      || [];
            categories   = JSON.parse(localStorage.getItem('realphone_categories')) || structuredClone(defaultCategories);
        } catch (e) {
            console.error('Error cargando datos:', e);
            users        = structuredClone(defaultUsers);
            products     = structuredClone(defaultProducts);
            salesHistory = [];
            categories   = structuredClone(defaultCategories);
        }
    }

    function saveData() {
        try {
            localStorage.setItem('realphone_users',       JSON.stringify(users));
            localStorage.setItem('realphone_products',    JSON.stringify(products));
            localStorage.setItem('realphone_sales',       JSON.stringify(salesHistory));
            localStorage.setItem('realphone_categories',  JSON.stringify(categories));
        } catch (e) {
            console.error('Error guardando datos:', e);
        }
    }

    // ==================== UTILIDADES ====================
    function formatMoney(amount) {
        return '$' + Number(amount).toFixed(2) + ' MXN';
    }

    function generateId() {
        return 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
    }

    // ==================== TOAST NOTIFICATIONS ====================
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const icons = {
            success: 'fas fa-check-circle',
            error:   'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info:    'fas fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // ==================== REFERENCIAS AL DOM ====================
    const setupOverlay       = document.getElementById('setupOverlay');
    const setupStoreSelect   = document.getElementById('setupStoreSelect');
    const btnSaveSetup       = document.getElementById('btnSaveSetup');
    const loginStoreNameDisplay = document.getElementById('loginStoreNameDisplay');

    const loginOverlay       = document.getElementById('loginOverlay');
    const posContainer       = document.getElementById('posContainer');
    const loginError         = document.getElementById('loginError');
    const productListEl      = document.getElementById('productList');
    const ticketBody         = document.getElementById('ticketBody');
    const totalDisplay       = document.getElementById('totalDisplay');
    const paymentInput       = document.getElementById('paymentInput');
    const paymentDisplay     = document.getElementById('paymentDisplay');
    const changeDisplay      = document.getElementById('changeDisplay');
    const ticketNumberEl     = document.getElementById('ticketNumber');
    const searchInput        = document.getElementById('searchInput');
    const currentUserDisplay = document.getElementById('currentUserDisplay');
    const inventoryModal     = document.getElementById('inventoryModal');
    const shortcutPanel      = document.getElementById('shortcutPanel');

    // ==================== CONFIGURACIÓN DE TIENDA ====================
    if (!currentBranch) {
        if (setupOverlay) setupOverlay.style.display = 'flex';
        if (loginOverlay) loginOverlay.style.display = 'none';
    } else {
        if (setupOverlay) setupOverlay.style.display = 'none';
        if (loginOverlay) loginOverlay.style.display = 'flex';
        if (loginStoreNameDisplay) loginStoreNameDisplay.textContent = 'Sucursal ' + currentBranch;
    }

    if (btnSaveSetup) {
        btnSaveSetup.addEventListener('click', () => {
            const val = setupStoreSelect.value;
            if (!val) {
                showToast('Selecciona una tienda primero', 'warning');
                return;
            }
            currentBranch = val;
            localStorage.setItem('realphone_current_store', val);
            
            if (loginStoreNameDisplay) loginStoreNameDisplay.textContent = 'Sucursal ' + currentBranch;
            if (setupOverlay) setupOverlay.style.display = 'none';
            if (loginOverlay) loginOverlay.style.display = 'flex';
        });
    }

    // ==================== AUTENTICACIÓN ====================
    function updateSaleCashierSelect() {
        const select = document.getElementById('saleCashierSelect');
        if (!select) return;
        select.innerHTML = '<option value="">¿Quién atiende esta venta?</option>';
        if (currentUser) {
            select.innerHTML += `<option value="${currentUser.username || currentUser.fullName}">${currentUser.username || currentUser.fullName}</option>`;
        }
        if (currentUser2) {
            select.innerHTML += `<option value="${currentUser2.username || currentUser2.fullName}">${currentUser2.username || currentUser2.fullName}</option>`;
        }
        
        if (currentUser2) {
            select.style.display = 'block';
            select.value = currentUser.username || currentUser.fullName; // Default
        } else {
            select.style.display = 'none';
            if (currentUser) select.value = currentUser.username || currentUser.fullName;
        }
    }

    document.getElementById('loginBtn').addEventListener('click', function () {
        const username = document.getElementById('loginUser').value.trim();
        const password = document.getElementById('loginPass').value.trim();

        if (!username || !password) {
            loginError.textContent = '⚠️ Ingresa usuario y contraseña';
            return;
        }

        // Usar usuarios de Firebase si están disponibles
        let authUsers = users;
        try {
            const firebaseUsers = localStorage.getItem('shared_firebase_users');
            if (firebaseUsers) {
                const parsed = JSON.parse(firebaseUsers);
                if (Array.isArray(parsed) && parsed.length > 0) authUsers = parsed;
            }
        } catch(e) {}

        let user = authUsers.find(
            u => (u.username || '').toLowerCase() === username.toLowerCase() && String(u.password) === String(password)
        );

        // Fallback a locales si no está en Firebase (por si intentan usar admin/1234)
        if (!user && authUsers !== users) {
            user = users.find(
                u => (u.username || '').toLowerCase() === username.toLowerCase() && String(u.password) === String(password)
            );
        }

        if (!user) {
            loginError.textContent = '❌ Usuario o contraseña incorrectos';
            return;
        }

        if (user.active === false) {
            loginError.textContent = '⚠️ Usuario desactivado';
            return;
        }

        // Login exitoso
        currentUser   = user;
        
        // Registrar en localStorage para que el Gestor lo lea
        localStorage.setItem('realphone_currentUser1', JSON.stringify(currentUser));
        
        // Control del branchSelect
        const branchSelect = document.getElementById('branchSelect');
        if (branchSelect) {
            if (user.role === 'admin' || user.role === 'tester') {
                branchSelect.style.display = 'inline-block';
            } else {
                branchSelect.style.display = 'none';
            }
        }

        currentUserDisplay.innerHTML =
            '<i class="fas fa-user-circle"></i> <span>' + (user.username || user.fullName) + (user.role === 'admin' ? ' (Admin)' : '') + '</span>';

        loginOverlay.classList.add('hidden');
        posContainer.style.display = 'flex';
        loginError.textContent = '';

        updateSaleCashierSelect();
        showToast('Bienvenido, ' + (user.username || user.fullName), 'success');
        renderProducts();
        updateTicketDisplay();
    });

    // Navegar con Enter en el login
    document.getElementById('loginUser').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('loginPass').focus();
    });
    document.getElementById('loginPass').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });

    // Cerrar sesión
    document.getElementById('btnLogout').addEventListener('click', function () {
        if (!confirm('¿Cerrar sesión actual?')) return;
        currentUser = null;
        currentUser2 = null;
        ticketItems = [];
        localStorage.removeItem('realphone_currentUser1');
        localStorage.removeItem('realphone_currentUser2');
        
        loginOverlay.classList.remove('hidden');
        posContainer.style.display = 'none';
        document.getElementById('loginUser').value = '';
        document.getElementById('loginPass').value = '';
        document.getElementById('coworkerDisplay').style.display = 'none';
        document.getElementById('btnAddCoworkerPOS').style.display = 'inline-block';
        showToast('Sesión cerrada', 'info');
    });

    // ==================== DOBLE SESIÓN (Coworker) ====================
    const btnAddCoworkerPOS = document.getElementById('btnAddCoworkerPOS');
    const addCoworkerModalPOS = document.getElementById('addCoworkerModalPOS');
    const btnCancelCoworkerPOS = document.getElementById('btnCancelCoworkerPOS');
    const btnLoginCoworkerPOS = document.getElementById('btnLoginCoworkerPOS');
    const coworkerDisplay = document.getElementById('coworkerDisplay');
    const btnRemoveCoworkerPOS = document.getElementById('btnRemoveCoworkerPOS');
    const coworkerErrorPOS = document.getElementById('coworkerErrorPOS');

    if (btnAddCoworkerPOS) {
        btnAddCoworkerPOS.addEventListener('click', () => {
            addCoworkerModalPOS.style.display = 'flex';
        });
    }
    if (btnCancelCoworkerPOS) {
        btnCancelCoworkerPOS.addEventListener('click', () => {
            addCoworkerModalPOS.style.display = 'none';
        });
    }
    if (btnLoginCoworkerPOS) {
        btnLoginCoworkerPOS.addEventListener('click', () => {
            const u = document.getElementById('coworkerUserPOS').value.trim();
            const p = document.getElementById('coworkerPassPOS').value.trim();

            let authUsers = users;
            try {
                const firebaseUsers = localStorage.getItem('shared_firebase_users');
                if (firebaseUsers) {
                    const parsed = JSON.parse(firebaseUsers);
                    if (Array.isArray(parsed) && parsed.length > 0) authUsers = parsed;
                }
            } catch(e) {}

            let user = authUsers.find(
                uObj => (uObj.username || '').toLowerCase() === u.toLowerCase() && String(uObj.password) === String(p)
            );

            // Fallback
            if (!user && authUsers !== users) {
                user = users.find(
                    uObj => (uObj.username || '').toLowerCase() === u.toLowerCase() && String(uObj.password) === String(p)
                );
            }

            if (!user) {
                coworkerErrorPOS.style.display = 'block';
                return;
            }

            if (currentUser && user.id === currentUser.id) {
                coworkerErrorPOS.textContent = 'Este usuario ya está iniciado.';
                coworkerErrorPOS.style.display = 'block';
                return;
            }

            currentUser2 = user;
            localStorage.setItem('realphone_currentUser2', JSON.stringify(currentUser2));
            
            coworkerDisplay.style.display = 'inline-flex';
            coworkerDisplay.querySelector('span').textContent = user.username || user.fullName;
            btnAddCoworkerPOS.style.display = 'none';
            addCoworkerModalPOS.style.display = 'none';
            coworkerErrorPOS.style.display = 'none';
            
            document.getElementById('coworkerUserPOS').value = '';
            document.getElementById('coworkerPassPOS').value = '';
            updateSaleCashierSelect();
            showToast('Segundo empleado iniciado', 'success');
        });
    }
    if (btnRemoveCoworkerPOS) {
        btnRemoveCoworkerPOS.addEventListener('click', () => {
            currentUser2 = null;
            localStorage.removeItem('realphone_currentUser2');
            coworkerDisplay.style.display = 'none';
            btnAddCoworkerPOS.style.display = 'inline-block';
            updateSaleCashierSelect();
        });
    }

    // Cambio de sucursal (solo admin)
    document.getElementById('branchSelect').addEventListener('change', function (e) {
        if (currentUser && currentUser.role === 'admin') {
            currentBranch = e.target.value;
            showToast('Sucursal cambiada: ' + currentBranch, 'info');
        } else if (currentUser) {
            e.target.value = currentBranch;
            showToast('Solo administradores pueden cambiar de sucursal', 'warning');
        }
    });

    // ==================== CATEGORÍAS: TABS DINÁMICOS ====================
    function renderCategoryTabs() {
        const tabsEl = document.getElementById('categoryTabs');
        if (!tabsEl) return;
        tabsEl.innerHTML = `<button class="category-tab ${activeCategory === 'todas' ? 'active' : ''}" data-cat="todas">📦 Todas</button>` +
            categories.map(c =>
                `<button class="category-tab ${activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>`
            ).join('');
        // Re-bind click listeners
        tabsEl.querySelectorAll('.category-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                tabsEl.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeCategory = btn.dataset.cat;
                renderProducts(document.getElementById('searchInput').value);
            });
        });
    }

    // ==================== CATEGORÍAS: SELECT EN FORMULARIO ====================
    function refreshCategorySelect() {
        const sel = document.getElementById('addCategory');
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        if (currentVal) sel.value = currentVal;
    }

    // ==================== CATEGORÍAS: LISTA EN MODAL ====================
    function renderCategoriesList() {
        const container = document.getElementById('categoriesListContainer');
        if (!container) return;
        if (categories.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:2rem;">No hay categorías. ¡Agrega la primera!</p>';
            return;
        }
        container.innerHTML = `<table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
            <thead><tr style="border-bottom:2px solid var(--border); color:var(--text-secondary); font-size:0.78rem; text-transform:uppercase; letter-spacing:0.5px;">
                <th style="text-align:left; padding:10px 12px;">Clave</th>
                <th style="text-align:left; padding:10px 12px;">Nombre visible</th>
                <th style="text-align:right; padding:10px 12px;">Productos</th>
                <th style="padding:10px 12px;"></th>
            </tr></thead>
            <tbody>${categories.map(c => {
                const count = products.filter(p => p.category === c.id).length;
                const isDefault = ['fundas','micas','otros'].includes(c.id);
                return `<tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:10px 12px; font-family:var(--font-mono); color:var(--accent);">${c.id}</td>
                    <td style="padding:10px 12px; font-weight:600;">${c.name}</td>
                    <td style="padding:10px 12px; text-align:right; color:var(--text-secondary);">${count}</td>
                    <td style="padding:10px 12px; text-align:right;">
                        ${!isDefault ? `<button onclick="window.deleteCategory('${c.id}')" style="background:var(--danger-light); border:1px solid var(--danger); color:var(--danger); border-radius:8px; padding:4px 10px; cursor:pointer; font-size:0.78rem; font-family:inherit;" title="Eliminar categoría"><i class='fas fa-trash'></i></button>` : '<span style="font-size:0.72rem; color:var(--text-secondary);">predeterminada</span>'}
                    </td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    }

    window.deleteCategory = function(id) {
        const count = products.filter(p => p.category === id).length;
        const cat = categories.find(c => c.id === id);
        if (!cat) return;
        const msg = count > 0
            ? `¿Eliminar la categoría "${cat.name}"? Los ${count} productos en esta categoría quedarán en categoría "otros".`
            : `¿Eliminar la categoría "${cat.name}"?`;
        if (!confirm(msg)) return;
        // Mover productos a 'otros'
        products.forEach(p => { if (p.category === id) p.category = 'otros'; });
        categories = categories.filter(c => c.id !== id);
        saveData();
        renderCategoryTabs();
        refreshCategorySelect();
        renderCategoriesList();
        showToast('Categoría eliminada', 'info');
    };

    // ==================== RENDERIZADO DE PRODUCTOS ====================
    window.deleteProduct = function(e, id) {
        e.stopPropagation();
        if (!confirm('¿Seguro que deseas eliminar este producto permanentemente del inventario?')) return;
        products = products.filter(p => p.id !== id);
        saveData();
        renderProducts(document.getElementById('searchInput') ? document.getElementById('searchInput').value : '');
        showToast('Producto eliminado', 'info');
    };

    function renderProducts(filterText = '') {
        if (!productListEl) return;

        const filtered = products.filter(p => {
            const matchCat   = activeCategory === 'todas' || p.category === activeCategory;
            const searchLower = filterText.toLowerCase();
            const matchSearch = !filterText ||
                p.name.toLowerCase().includes(searchLower) ||
                p.sku.toLowerCase().includes(searchLower);
            return matchCat && matchSearch;
        });

        if (filtered.length === 0) {
            productListEl.innerHTML =
                '<div style="text-align:center; color:var(--text-secondary); padding:2rem; font-weight:500;">No se encontraron productos</div>';
            return;
        }

        productListEl.innerHTML = filtered.map(p => `
            <div class="product-item" onclick="window.addToTicket('${p.id}')" title="Click para agregar al ticket">
                <div class="info">
                    <span class="sku">${p.sku}</span>
                    <span class="name">${p.name}</span>
                </div>
                <div>
                    <div class="price">${formatMoney(p.price)}</div>
                    <div class="stock-badge">Stock: ${p.stock}</div>
                </div>
            </div>
        `).join('');
    }

    // ==================== TICKET ====================
    window.addToTicket = function (productId) {
        const product = products.find(p => p.id === productId);
        if (!product) { showToast('Producto no encontrado', 'error'); return; }
        if (product.stock <= 0) { showToast('⚠️ Producto sin stock disponible', 'warning'); return; }

        const existing = ticketItems.find(i => i.id === productId);
        if (existing) {
            if (existing.qty >= product.stock) {
                showToast('Stock máximo alcanzado (' + product.stock + ' disponibles)', 'warning');
                return;
            }
            existing.qty += 1;
        } else {
            ticketItems.push({
                id:    product.id,
                sku:   product.sku,
                name:  product.name,
                price: product.price,
                cost:  product.cost,
                stock: product.stock,
                qty:   1
            });
        }
        updateTicketDisplay();
        showToast('Agregado: ' + product.name, 'success');
    };

    window.removeTicketItem = function (index) {
        const removed = ticketItems.splice(index, 1);
        updateTicketDisplay();
        if (removed.length) showToast('Eliminado: ' + removed[0].name, 'info');
    };

    function updateTicketDisplay() {
        if (!ticketBody) return;

        if (ticketItems.length === 0) {
            ticketBody.innerHTML =
                '<tr><td colspan="7" class="empty-ticket">0 Productos en la venta actual.</td></tr>';
        } else {
            ticketBody.innerHTML = ticketItems.map((item, idx) => `
                <tr>
                    <td>${item.sku}</td>
                    <td>${item.name}</td>
                    <td>${formatMoney(item.price)}</td>
                    <td>${item.qty}</td>
                    <td>${formatMoney(item.price * item.qty)}</td>
                    <td>${item.stock}</td>
                    <td><i class="fas fa-times-circle delete-icon"
                           onclick="window.removeTicketItem(${idx})"
                           title="Eliminar producto"></i></td>
                </tr>
            `).join('');
        }

        const total = ticketItems.reduce((s, i) => s + (i.price * i.qty), 0);
        totalDisplay.textContent = formatMoney(total);

        const pago = parseFloat(paymentInput.value) || 0;
        paymentDisplay.textContent = formatMoney(pago);
        changeDisplay.textContent  = formatMoney(Math.max(0, pago - total));
    }

    // ==================== COBRAR ====================
    document.getElementById('btnCobrar').addEventListener('click', function () {
        if (ticketItems.length === 0) {
            showToast('Agrega productos al ticket antes de cobrar', 'warning');
            return;
        }

        const total = ticketItems.reduce((s, i) => s + (i.price * i.qty), 0);
        const pago  = parseFloat(paymentInput.value) || 0;

        if (pago < total) {
            showToast('Pago insuficiente. Faltan: ' + formatMoney(total - pago), 'error');
            return;
        }

        if (!confirm(
            '¿Confirmar venta por ' + formatMoney(total) + '?\n' +
            'Pago: ' + formatMoney(pago) + '\n' +
            'Cambio: ' + formatMoney(pago - total)
        )) return;

        // Descontar stock
        ticketItems.forEach(item => {
            const prod = products.find(p => p.id === item.id);
            if (prod) prod.stock = Math.max(0, prod.stock - item.qty);
        });

        // Obtener quién atendió (si hay doble sesión)
        const cashierSelect = document.getElementById('saleCashierSelect');
        let selectedCashier = currentUser.fullName || currentUser.username;
        if (cashierSelect && cashierSelect.style.display !== 'none' && cashierSelect.value) {
            selectedCashier = cashierSelect.value;
        }

        // Registrar venta
        const sale = {
            id:      'SALE-' + Date.now(),
            date:    new Date().toISOString().slice(0, 10),
            time:    new Date().toLocaleTimeString(),
            branch:  currentBranch,
            cashier: selectedCashier,
            items:   ticketItems.map(i => ({ ...i })),
            total:   total,
            profit:  ticketItems.reduce((s, i) => s + ((i.price - i.cost) * i.qty), 0),
            payment: pago,
            change:  pago - total
        };
        salesHistory.push(sale);
        saveData();

        // Imprimir ticket
        printSaleTicket(sale, ticketCounter);

        showToast('✅ Venta registrada — Ticket #' + ticketCounter + ' — Total: ' + formatMoney(total), 'success');

        // Nuevo ticket
        ticketItems = [];
        paymentInput.value = '';
        ticketCounter++;
        ticketNumberEl.textContent = ticketCounter;
        updateTicketDisplay();
        renderProducts(searchInput.value);
    });

    // ==================== BOTONES DE ACCIÓN ====================
    paymentInput.addEventListener('input', updateTicketDisplay);

    document.getElementById('btnDeleteItem').addEventListener('click', function () {
        if (ticketItems.length === 0) { showToast('No hay productos en el ticket', 'warning'); return; }
        const removed = ticketItems.pop();
        updateTicketDisplay();
        showToast('Eliminado: ' + removed.name, 'info');
    });

    document.getElementById('btnBuscar').addEventListener('click', function () {
        searchInput.focus();
        searchInput.select();
    });

    document.getElementById('btnPendiente').addEventListener('click', function () {
        if (ticketItems.length === 0) { showToast('No hay productos para dejar pendiente', 'warning'); return; }
        showToast('📋 Ticket #' + ticketCounter + ' guardado como pendiente', 'info');
    });

    // ==================== BÚSQUEDA ====================
    document.getElementById('btnSearch').addEventListener('click', function () {
        renderProducts(searchInput.value);
    });

    searchInput.addEventListener('input', function () {
        renderProducts(this.value);
    });

    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') renderProducts(this.value);
    });

    // ==================== CATEGORÍAS ====================
    document.getElementById('categoryTabs').addEventListener('click', function (e) {
        if (e.target.classList.contains('category-tab')) {
            document.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            activeCategory = e.target.dataset.cat;
            renderProducts(searchInput.value);
        }
    });

    // ==================== MODAL DE INVENTARIO ====================
    function openInventoryModal() {
        inventoryModal.classList.add('active');
        resetImportState();
    }

    function closeInventoryModal() {
        inventoryModal.classList.remove('active');
        resetImportState();
    }

    function resetImportState() {
        pendingImportData = [];
        const preview = document.getElementById('importPreview');
        const actions = document.getElementById('importActions');
        const status  = document.getElementById('importStatus');
        if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
        if (actions) actions.style.display = 'none';
        if (status) status.innerHTML = '';
    }

    // Modal de Configuración General
    const configModal = document.getElementById('configModal');
    const btnConfig = document.getElementById('btnConfig');
    if (btnConfig) btnConfig.addEventListener('click', function() {
        const isAdminOrTester = currentUser && (currentUser.role === 'admin' || currentUser.role === 'tester');
        document.getElementById('btnInventario').style.display = isAdminOrTester ? 'flex' : 'none';
        document.getElementById('btnAddProduct').style.display = isAdminOrTester ? 'flex' : 'none';
        configModal.classList.add('active');
    });
    const btnCloseConfig = document.getElementById('btnCloseConfig');
    if (btnCloseConfig) btnCloseConfig.addEventListener('click', () => configModal.classList.remove('active'));
    
    // Cerrar config modal al click fuera
    if (configModal) {
        configModal.addEventListener('click', function (e) {
            if (e.target === configModal) configModal.classList.remove('active');
        });
    }

    document.getElementById('btnInventario').addEventListener('click', openInventoryModal);
    document.getElementById('btnAddProduct').addEventListener('click', function() {
        openInventoryModal();
        // Activar tab "Agregar Producto"
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('.modal-tab[data-tab="add"]').classList.add('active');
        document.getElementById('tabAdd').classList.add('active');
        setTimeout(() => document.getElementById('addSku').focus(), 100);
    });
    document.getElementById('btnCloseInventory').addEventListener('click', closeInventoryModal);

    // Cerrar modal al hacer click fuera
    inventoryModal.addEventListener('click', function (e) {
        if (e.target === inventoryModal) closeInventoryModal();
    });

    // Tabs del modal
    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            const tabMap = { add: 'tabAdd', import: 'tabImport', export: 'tabExport', delete: 'tabDelete', categories: 'tabCategories' };
            const tabId = tabMap[this.dataset.tab] || 'tabAdd';
            const tabEl = document.getElementById(tabId);
            if (tabEl) tabEl.classList.add('active');
            if (this.dataset.tab === 'categories') renderCategoriesList();
        });
    });

    // ==================== AGREGAR PRODUCTO (FORMULARIO) ====================
    document.getElementById('addProductForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const sku   = document.getElementById('addSku').value.trim().toUpperCase();
        const name  = document.getElementById('addName').value.trim();
        const cat   = document.getElementById('addCategory').value;
        const cost  = parseFloat(document.getElementById('addCost').value) || 0;
        const price = parseFloat(document.getElementById('addPrice').value) || 0;
        const stock = parseInt(document.getElementById('addStock').value) || 0;

        if (!sku || !name) {
            showToast('Completa los campos obligatorios (SKU y Nombre)', 'warning');
            return;
        }

        if (price <= 0) {
            showToast('El precio de venta debe ser mayor a 0', 'warning');
            return;
        }

        // Verificar SKU duplicado
        const existing = products.find(p => p.sku.toUpperCase() === sku);
        if (existing) {
            showToast('Ya existe un producto con SKU: ' + sku + ' (' + existing.name + ')', 'error');
            document.getElementById('addSku').focus();
            return;
        }

        const newProduct = {
            id:       generateId(),
            sku:      sku,
            name:     name,
            category: cat,
            cost:     cost,
            price:    price,
            stock:    stock
        };

        products.push(newProduct);
        saveData();
        
        renderProducts(document.getElementById('searchInput').value);
        if (window.refreshDeleteProductSelect) window.refreshDeleteProductSelect();
        
        showToast('✅ Producto agregado al inventario', 'success');
        
        // Mostrar en "recién agregados"
        const recentEl = document.getElementById('recentlyAdded');
        const badge = `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--success-light);border:1px solid rgba(16,185,129,0.2);border-radius:8px;margin-bottom:6px;font-size:0.85rem;">
            <i class="fas fa-check-circle" style="color:var(--success)"></i>
            <strong>${sku}</strong> — ${name} — $${price.toFixed(2)} — Stock: ${stock}
        </div>`;
        recentEl.innerHTML = badge + recentEl.innerHTML;

        // Limpiar form y enfocar SKU para agregar otro
        this.reset();
        document.getElementById('addCost').value = '0';
        document.getElementById('addStock').value = '1';
        document.getElementById('addSku').focus();
    });

    // ==================== IMPORTACIÓN DE EXCEL ====================
    const dropZone  = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    // Click en la zona de drop
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) processExcelFile(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) processExcelFile(e.target.files[0]);
        fileInput.value = ''; // Reset para permitir seleccionar el mismo archivo
    });

    function processExcelFile(file) {
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        const ext = file.name.split('.').pop().toLowerCase();

        if (!validTypes.includes(file.type) && !['xlsx', 'xls'].includes(ext)) {
            showToast('Formato no válido. Solo se aceptan archivos .xlsx o .xls', 'error');
            return;
        }

        const statusEl = document.getElementById('importStatus');
        statusEl.innerHTML = '<span class="status-badge warning"><i class="fas fa-spinner fa-spin"></i> Procesando archivo...</span>';

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // Leer la primera hoja
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData  = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                if (jsonData.length === 0) {
                    statusEl.innerHTML = '<span class="status-badge error"><i class="fas fa-exclamation-circle"></i> El archivo está vacío</span>';
                    return;
                }

                // Mapear columnas (flexible)
                const mapped = mapImportData(jsonData);

                if (mapped.length === 0) {
                    statusEl.innerHTML = '<span class="status-badge error"><i class="fas fa-exclamation-circle"></i> No se encontraron columnas válidas (SKU, Nombre, Precio)</span>';
                    return;
                }

                pendingImportData = mapped;
                statusEl.innerHTML = `<span class="status-badge success"><i class="fas fa-check-circle"></i> ${mapped.length} productos leídos de "${file.name}"</span>`;

                // Mostrar preview
                renderImportPreview(mapped);
                document.getElementById('importActions').style.display = 'flex';

            } catch (err) {
                console.error('Error procesando Excel:', err);
                statusEl.innerHTML = '<span class="status-badge error"><i class="fas fa-exclamation-circle"></i> Error al leer el archivo: ' + err.message + '</span>';
            }
        };

        reader.onerror = function () {
            statusEl.innerHTML = '<span class="status-badge error"><i class="fas fa-exclamation-circle"></i> Error al leer el archivo</span>';
        };

        reader.readAsArrayBuffer(file);
    }

    function mapImportData(jsonData) {
        // Mapeo flexible de columnas — soporta varios nombres
        const colMap = {
            sku:      ['sku', 'codigo', 'código', 'code', 'cod', 'clave'],
            name:     ['nombre', 'name', 'descripcion', 'descripción', 'producto', 'articulo', 'artículo'],
            category: ['categoria', 'categoría', 'category', 'cat', 'tipo'],
            cost:     ['costo', 'cost', 'precio_costo', 'costo_unitario'],
            price:    ['precio', 'price', 'precio_venta', 'pvp', 'precio_unitario'],
            stock:    ['stock', 'existencia', 'existencias', 'cantidad', 'qty', 'inventario', 'disponible']
        };

        function findCol(row, aliases) {
            const keys = Object.keys(row);
            for (const alias of aliases) {
                const found = keys.find(k => k.toLowerCase().trim() === alias);
                if (found) return row[found];
            }
            return undefined;
        }

        return jsonData
            .map(row => {
                const sku   = String(findCol(row, colMap.sku)  || '').trim();
                const name  = String(findCol(row, colMap.name) || '').trim();
                const cat   = String(findCol(row, colMap.category) || 'sin_categoria').trim().toLowerCase().replace(/\s+/g, '_');
                const cost  = parseFloat(findCol(row, colMap.cost))  || 0;
                const price = parseFloat(findCol(row, colMap.price)) || 0;
                const stock = parseInt(findCol(row, colMap.stock))   || 0;

                if (!sku && !name) return null; // Fila vacía

                return {
                    sku:      sku || 'SIN-SKU',
                    name:     name || 'Producto sin nombre',
                    category: cat,
                    cost:     cost,
                    price:    price,
                    stock:    stock
                };
            })
            .filter(Boolean);
    }

    function renderImportPreview(data) {
        const previewEl = document.getElementById('importPreview');
        previewEl.style.display = 'block';

        let html = `<table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>SKU</th>
                    <th>Nombre</th>
                    <th>Categoría</th>
                    <th>Costo</th>
                    <th>Precio</th>
                    <th>Stock</th>
                    <th>Estado</th>
                </tr>
            </thead>
            <tbody>`;

        data.forEach((item, idx) => {
            const existing = products.find(p => p.sku.toLowerCase() === item.sku.toLowerCase());
            const status = existing
                ? '<span class="status-badge warning"><i class="fas fa-sync"></i> Actualizar</span>'
                : '<span class="status-badge success"><i class="fas fa-plus"></i> Nuevo</span>';

            html += `<tr>
                <td>${idx + 1}</td>
                <td>${item.sku}</td>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>${formatMoney(item.cost)}</td>
                <td>${formatMoney(item.price)}</td>
                <td>${item.stock}</td>
                <td>${status}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        previewEl.innerHTML = html;
    }

    // Confirmar importación
    document.getElementById('btnConfirmImport').addEventListener('click', function () {
        if (pendingImportData.length === 0) {
            showToast('No hay datos para importar', 'warning');
            return;
        }

        let added   = 0;
        let updated = 0;
        let importedCount = 0;

        pendingImportData.forEach(item => {
            const existingIdx = products.findIndex(p => p.sku.toLowerCase() === item.sku.toLowerCase());

            if (existingIdx >= 0) {
                // Actualizar producto existente
                products[existingIdx].name     = item.name;
                products[existingIdx].category = item.category;
                products[existingIdx].cost     = item.cost;
                products[existingIdx].price    = item.price;
                products[existingIdx].stock    = item.stock;
                updated++;
                importedCount++;
            } else {
                // Agregar nuevo producto
                products.push({
                    id:       generateId(),
                    sku:      item.sku,
                    name:     item.name,
                    category: item.category,
                    cost:     item.cost,
                    price:    item.price,
                    stock:    item.stock
                });
                added++;
                importedCount++;
            }
        });

        if (importedCount > 0) {
            saveData();
            renderProducts(document.getElementById('searchInput').value);
            renderCategoryTabs();
            refreshCategorySelect();
            if (window.refreshDeleteProductSelect) window.refreshDeleteProductSelect();
            showToast(`✅ Importación completada: ${importedCount} productos agregados/actualizados`, 'success');
        }
        
        resetImportState();
    });

    // Cancelar importación
    document.getElementById('btnCancelImport').addEventListener('click', resetImportState);

    // ==================== EXPORTACIÓN DE EXCEL ====================
    // Selección de tipo de exportación
    document.querySelectorAll('.export-option').forEach(opt => {
        opt.addEventListener('click', function () {
            document.querySelectorAll('.export-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            selectedExportType = this.dataset.type;
        });
    });

    document.getElementById('btnExport').addEventListener('click', function () {
        if (typeof XLSX === 'undefined') {
            showToast('Error: Librería SheetJS no cargada', 'error');
            return;
        }

        let wsData = [];
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);

        switch (selectedExportType) {
            case 'full':
                wsData = products.map((p, idx) => ({
                    '#':          idx + 1,
                    'SKU':        p.sku,
                    'Nombre':     p.name,
                    'Categoría':  p.category,
                    'Costo':      p.cost,
                    'Precio':     p.price,
                    'Stock':      p.stock,
                    'Margen':     p.price - p.cost,
                    'Valor_Stock': p.price * p.stock
                }));
                break;

            case 'stock':
                wsData = products.map((p, idx) => ({
                    '#':      idx + 1,
                    'SKU':    p.sku,
                    'Nombre': p.name,
                    'Stock':  p.stock,
                    'Valor':  p.price * p.stock
                }));
                break;

            case 'template':
                wsData = [
                    { SKU: 'FUNDA-EJ', Nombre: 'Funda Genérica para Celular', Categoría: 'fundas', Costo: 30, Precio: 99, Stock: 50 },
                    { SKU: 'MICA-EJ', Nombre: 'Mica Normal Cristal Templado', Categoría: 'micas', Costo: 15, Precio: 49, Stock: 100 }
                ];
                break;
        }

        if (wsData.length === 0) {
            showToast('No hay datos para exportar', 'warning');
            return;
        }

        try {
            const ws = XLSX.utils.json_to_sheet(wsData);
            const wb = XLSX.utils.book_new();

            // Ajustar ancho de columnas
            const colWidths = Object.keys(wsData[0]).map(key => ({
                wch: Math.max(key.length, ...wsData.map(row => String(row[key] || '').length)) + 2
            }));
            ws['!cols'] = colWidths;

            const sheetNames = {
                full:     'Inventario_Completo',
                stock:    'Stock',
                template: 'Plantilla'
            };

            XLSX.utils.book_append_sheet(wb, ws, sheetNames[selectedExportType] || 'Datos');

            const fileName = `RealPhone_POS_${sheetNames[selectedExportType]}_${dateStr}.xlsx`;
            XLSX.writeFile(wb, fileName);

            showToast('📥 Archivo descargado: ' + fileName, 'success');
        } catch (err) {
            console.error('Error exportando:', err);
            showToast('Error al exportar: ' + err.message, 'error');
        }
    });

    // ==================== ATAJOS DE TECLADO ====================
    let shortcutPanelVisible = false;

    function toggleShortcutPanel() {
        shortcutPanelVisible = !shortcutPanelVisible;
        shortcutPanel.classList.toggle('visible', shortcutPanelVisible);
    }

    document.addEventListener('keydown', function (e) {
        // Permitir '?' incluso sin sesión para ver atajos
        if (e.key === '?' && !isTyping(e)) {
            e.preventDefault();
            toggleShortcutPanel();
            return;
        }

        // Cerrar modal/panel con Escape
        if (e.key === 'Escape') {
            const servicesModal = document.getElementById('servicesModal');
            if (servicesModal && servicesModal.classList.contains('active')) {
                if (window.closeServicesModal) window.closeServicesModal();
                e.preventDefault();
                return;
            }
            if (inventoryModal.classList.contains('active')) {
                closeInventoryModal();
                e.preventDefault();
                return;
            }
            if (shortcutPanelVisible) {
                toggleShortcutPanel();
                e.preventDefault();
                return;
            }
        }

        if (!currentUser) return; // Solo si hay sesión activa

        // No interceptar atajos si el usuario está escribiendo en un input/textarea
        // EXCEPTO para las teclas de función
        const isFKey = /^F\d{1,2}$/.test(e.key);

        if (!isFKey && isTyping(e)) return;

        switch (e.key) {
            case 'F3':
                e.preventDefault();
                if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'tester')) {
                    showToast('F3: Registrar salida de inventario', 'info');
                } else {
                    showToast('⛔ Solo administradores pueden registrar salidas', 'error');
                }
                break;
            case 'F4':
                e.preventDefault();
                const btnCorte = document.getElementById('btnCorte');
                if (btnCorte) btnCorte.click();
                break;
            case 'F5':
                e.preventDefault();
                if (ticketItems.length > 0) {
                    const lastItem = ticketItems[ticketItems.length - 1];
                    const newQty = prompt('Cambiar cantidad de "' + lastItem.name + '":\nCantidad actual: ' + lastItem.qty, lastItem.qty);
                    if (newQty !== null) {
                        const q = parseInt(newQty);
                        if (!isNaN(q) && q > 0 && q <= lastItem.stock) {
                            lastItem.qty = q;
                            updateTicketDisplay();
                            showToast('Cantidad actualizada: ' + lastItem.name + ' → ' + q, 'success');
                        } else if (q <= 0) {
                            showToast('La cantidad debe ser mayor a 0', 'warning');
                        } else {
                            showToast('Stock insuficiente (máx: ' + lastItem.stock + ')', 'warning');
                        }
                    }
                } else {
                    showToast('No hay productos en el ticket para cambiar', 'warning');
                }
                break;
            case 'F6':
                e.preventDefault();
                document.getElementById('btnPendiente').click();
                break;
            case 'F7':
                e.preventDefault();
                if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'tester')) {
                    handleStockEntry();
                } else {
                    showToast('⛔ Solo administradores pueden registrar entradas', 'error');
                }
                break;
            case 'F2':
                e.preventDefault();
                if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'tester')) {
                    document.getElementById('btnAddProduct').click();
                } else {
                    showToast('⛔ Solo administradores pueden añadir productos', 'error');
                }
                break;
            case 'F8':
                e.preventDefault();
                if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'tester')) {
                    openInventoryModal();
                } else {
                    showToast('⛔ Solo administradores pueden abrir el inventario', 'error');
                }
                break;
            case 'F9':
                e.preventDefault();
                handlePriceCheck();
                break;
            case 'F10':
                e.preventDefault();
                document.getElementById('btnBuscar').click();
                break;
            case 'F11':
                e.preventDefault();
                if (window.openServicesModal) {
                    const gestor = document.getElementById('gestorContainer');
                    if (gestor && gestor.style.display !== 'none') {
                        window.closeServicesModal();
                    } else {
                        window.openServicesModal();
                    }
                }
                break;
            case 'F12':
                e.preventDefault();
                document.getElementById('btnCobrar').click();
                break;
            case 'Delete':
                if (!isTyping(e)) {
                    e.preventDefault();
                    document.getElementById('btnDeleteItem').click();
                }
                break;
        }
    });

    function isTyping(e) {
        const tag = (e.target || e.srcElement).tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    // ==================== FUNCIONES DE ATAJOS ====================
    function handleStockEntry() {
        const sku = prompt('🔹 Entrada de inventario\nIngresa el SKU del producto:');
        if (!sku) return;

        const product = products.find(p => p.sku.toLowerCase() === sku.toLowerCase());
        if (!product) {
            showToast('Producto no encontrado: ' + sku, 'error');
            return;
        }

        const qty = parseInt(prompt('Producto: ' + product.name + '\nStock actual: ' + product.stock + '\n\nCantidad a agregar:'));
        if (isNaN(qty) || qty <= 0) {
            showToast('Cantidad no válida', 'warning');
            return;
        }

        product.stock += qty;
        saveData();
        renderProducts(searchInput.value);
        showToast('✅ Entrada registrada: +' + qty + ' unidades de ' + product.name + ' (Stock: ' + product.stock + ')', 'success');
    }

    function handlePriceCheck() {
        const sku = prompt('🔍 Verificador de Precios\nIngresa SKU o nombre del producto:');
        if (!sku) return;

        const product = products.find(p =>
            p.sku.toLowerCase() === sku.toLowerCase() ||
            p.name.toLowerCase().includes(sku.toLowerCase())
        );

        if (!product) {
            showToast('Producto no encontrado: ' + sku, 'error');
            return;
        }

        alert(
            '📋 VERIFICADOR DE PRECIOS\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            'SKU: ' + product.sku + '\n' +
            'Nombre: ' + product.name + '\n' +
            'Categoría: ' + product.category + '\n' +
            'Precio: ' + formatMoney(product.price) + '\n' +
            'Costo: ' + formatMoney(product.cost) + '\n' +
            'Margen: ' + formatMoney(product.price - product.cost) + '\n' +
            'Stock: ' + product.stock + ' unidades'
        );
    }


    // ==================== AGREGAR CATEGORÍA ====================
    const addCategoryForm = document.getElementById('addCategoryForm');
    if (addCategoryForm) {
        addCategoryForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const idVal   = document.getElementById('newCategoryId').value.trim().toLowerCase().replace(/\s+/g, '_');
            const nameVal = document.getElementById('newCategoryName').value.trim();
            if (!idVal || !nameVal) { showToast('Completa ambos campos', 'warning'); return; }
            if (categories.find(c => c.id === idVal)) {
                showToast('Ya existe una categoría con esa clave: ' + idVal, 'error'); return;
            }
            categories.push({ id: idVal, name: nameVal });
            saveData();
            renderCategoryTabs();
            refreshCategorySelect();
            renderCategoriesList();
            this.reset();
            showToast('Categoría "' + nameVal + '" agregada', 'success');
        });
    }

    // ==================== ELIMINAR PRODUCTO ====================
    const deleteProductSelect = document.getElementById('deleteProductSelect');
    const btnDeleteSelectedProduct = document.getElementById('btnDeleteSelectedProduct');
    
    window.refreshDeleteProductSelect = function() {
        if (!deleteProductSelect) return;
        deleteProductSelect.innerHTML = '<option value="">Selecciona un producto...</option>' + 
            products.map(p => `<option value="${p.id}">${p.sku} - ${p.name}</option>`).join('');
    };

    if (btnDeleteSelectedProduct && deleteProductSelect) {
        btnDeleteSelectedProduct.addEventListener('click', function() {
            const id = deleteProductSelect.value;
            if (!id) {
                showToast('Selecciona un producto para eliminar', 'warning');
                return;
            }
            const prod = products.find(p => p.id === id);
            if (!prod) return;
            
            if (confirm(`¿Estás completamente seguro de eliminar "${prod.name}" del sistema de forma permanente?`)) {
                products = products.filter(p => p.id !== id);
                saveData();
                renderProducts(document.getElementById('searchInput') ? document.getElementById('searchInput').value : '');
                window.refreshDeleteProductSelect();
                showToast('Producto eliminado permanentemente', 'success');
            }
        });
    }

    // ==================== TEMA GLOBAL ====================
    (function initTheme() {
        const THEME_KEY = 'realphone_theme';
        const themeNames = { light: '☀️ Claro', dark: '🌙 Oscuro', blue: '🌊 Azul Noche', emerald: '🌿 Esmeralda' };
        const saved = localStorage.getItem(THEME_KEY) || 'light';
        applyTheme(saved);

        function applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem(THEME_KEY, theme);
            // Actualizar botón
            const lbl = document.getElementById('globalThemeBtnLabel');
            if (lbl) lbl.textContent = themeNames[theme] || 'Tema';
            // Marcar opción activa
            document.querySelectorAll('.theme-opt').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === theme);
            });
        }

        const btn = document.getElementById('globalThemeBtn');
        const dropdown = document.getElementById('globalThemeDropdown');
        if (btn && dropdown) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('open');
            });
            document.addEventListener('click', () => dropdown.classList.remove('open'));
            dropdown.addEventListener('click', (e) => {
                const opt = e.target.closest('.theme-opt');
                if (!opt) return;
                applyTheme(opt.dataset.theme);
                dropdown.classList.remove('open');
            });
        }
    })();

    // ==================== INICIALIZACIÓN ====================
    loadData();
    console.log('Sistema RealPhone POS inicializado');
    console.log('Usuarios cargados:', users.length);
    console.log('Productos cargados:', products.length);
    console.log('Categorías cargadas:', categories.length);

    renderCategoryTabs();
    refreshCategorySelect();
    if (window.refreshDeleteProductSelect) window.refreshDeleteProductSelect();
    renderProducts();
    updateTicketDisplay();

    // ==================== GESTOR DE TICKETS (INTEGRACIÓN) ====================
    window.openServicesModal = function() {
        const gestor = document.getElementById('gestorContainer');
        const pos = document.getElementById('posContainer');
        if (gestor && pos) {
            pos.style.display = 'none';
            gestor.style.display = 'flex';
        }
    };

    window.closeServicesModal = function() {
        const gestor = document.getElementById('gestorContainer');
        const pos = document.getElementById('posContainer');
        if (gestor && gestor.style.display !== 'none') {
            gestor.style.display = 'none';
            pos.style.display = 'flex';
            if (searchInput) searchInput.focus();
        }
    };

    const btnToggleGestor = document.getElementById('btnToggleGestor');
    if (btnToggleGestor) btnToggleGestor.addEventListener('click', window.openServicesModal);

    // ==================== CÓMO USAR (AYUDA) ====================
    const helpModal = document.getElementById('helpModal');
    const btnHelpSystem = document.getElementById('btnHelpSystem');
    const btnCloseHelp = document.getElementById('btnCloseHelp');
    const btnReadHelp = document.getElementById('btnReadHelp');

    if (btnHelpSystem) {
        btnHelpSystem.addEventListener('click', () => {
            if (helpModal) helpModal.style.display = 'flex';
        });
    }
    
    if (btnCloseHelp) {
        btnCloseHelp.addEventListener('click', () => {
            if (helpModal) helpModal.style.display = 'none';
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        });
    }
    // Forzar carga de voces (necesario en Chrome/Edge)
    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
        window.speechSynthesis.getVoices();
    }

    if (btnReadHelp) {
        btnReadHelp.addEventListener('click', () => {
            if (!('speechSynthesis' in window)) {
                showToast('Tu navegador no soporta lectura en voz alta', 'error');
                return;
            }
            
            const textToRead = document.getElementById('helpContentText').innerText;
            const utterance = new SpeechSynthesisUtterance(textToRead);
            utterance.lang = 'es-MX';
            
            let voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) {
                // Si aún no cargan las voces, el navegador usará la voz predeterminada del sistema
                console.warn('Las voces aún no cargan, usando voz predeterminada.');
            } else {
                const zephyrVoice = voices.find(v => v.name.toLowerCase().includes('zephyr'));
                if (zephyrVoice) {
                    utterance.voice = zephyrVoice;
                } else {
                    const esVoice = voices.find(v => v.lang.startsWith('es'));
                    if (esVoice) utterance.voice = esVoice;
                }
            }
            
            window.speechSynthesis.cancel();
            
            // Timeout pequeño para asegurar que el cancel() se procese
            setTimeout(() => {
                window.speechSynthesis.speak(utterance);
            }, 50);
        });
    }

    // ==================== IMPRESIÓN DE TICKETS ====================
    function getStoreAddress() {
        return currentBranch && STORE_ADDRESSES[currentBranch] ? STORE_ADDRESSES[currentBranch] : '';
    }

    function printTicketHTML(content) {
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
            showToast('Permite las ventanas emergentes para imprimir tickets', 'warning');
            return;
        }
        printWindow.document.write(`
            <html>
            <head>
                <style>
                    body { font-family: 'Courier New', monospace; padding: 10px; margin: 0 auto; color: black; font-size: 14px; width: 300px; box-sizing: border-box; }
                    .header { text-align: center; margin-bottom: 10px; }
                    .header h1 { font-size: 18px; margin: 0; font-weight: bold; }
                    .header p { margin: 2px 0; font-size: 12px; }
                    .text-center { text-align: center; }
                    .text-right { text-align: right; }
                    .font-bold { font-weight: bold; }
                    .mb { margin-bottom: 10px; }
                    .divider { border-bottom: 1px dashed black; margin: 10px 0; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 14px; }
                    th, td { padding: 4px 0; }
                    @media print { body { margin: 0; } }
                </style>
            </head>
            <body>
                ${content}
                <div class="divider"></div>
                <div class="text-center" style="font-size: 12px; margin-top: 20px;"><p>*** Gracias por su preferencia ***</p></div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 300);
    }

    function printSaleTicket(sale, ticketNum) {
        let itemsHtml = sale.items.map(i => `
            <tr>
                <td>${i.qty}x ${i.name.substring(0,18)}</td>
                <td class="text-right">${formatMoney(i.price)}</td>
                <td class="text-right">${formatMoney(i.price * i.qty)}</td>
            </tr>
        `).join('');

        const content = `
            <div class="header">
                <h1>REALPHONE</h1>
                <p>by Telcel</p>
                <p>Sucursal: ${sale.branch || 'N/A'}</p>
                <p style="font-size:10px;">${getStoreAddress()}</p>
                <p>Ticket de VENTA #${ticketNum}</p>
                <p>Fecha: ${sale.date} ${sale.time}</p>
            </div>
            <div class="divider"></div>
            <div style="margin-bottom: 5px;"><strong>Cajero:</strong> ${sale.cashier}</div>
            <div class="divider"></div>
            <table>
                <tr><th style="text-align:left">Cant/Art</th><th class="text-right">P.U.</th><th class="text-right">Importe</th></tr>
                ${itemsHtml}
            </table>
            <div class="divider"></div>
            <div class="text-right font-bold" style="font-size: 16px;">TOTAL: ${formatMoney(sale.total)}</div>
            <div class="text-right">Pago con: ${formatMoney(sale.payment)}</div>
            <div class="text-right">Cambio: ${formatMoney(sale.change)}</div>
        `;
        printTicketHTML(content);
    }

    // ==================== CORTE DE CAJA ====================
    const corteModal = document.getElementById('corteModal');
    const btnCorte = document.getElementById('btnCorte');
    const btnCloseCorte = document.getElementById('btnCloseCorte');
    
    const corteTotalSales = document.getElementById('corteTotalSales');
    const corteTotalItems = document.getElementById('corteTotalItems');
    const corteTotalProfit = document.getElementById('corteTotalProfit');

    function calculateCorte() {
        let totalSales = 0;
        let totalItems = 0;
        let totalProfit = 0;

        salesHistory.forEach(sale => {
            totalSales += sale.total;
            totalProfit += sale.profit || 0;
            sale.items.forEach(item => {
                totalItems += item.qty;
            });
        });

        return { totalSales, totalItems, totalProfit };
    }

    function openCorteModal() {
        const totals = calculateCorte();
        if (corteTotalSales) corteTotalSales.textContent = formatMoney(totals.totalSales);
        if (corteTotalItems) corteTotalItems.textContent = totals.totalItems;
        if (corteTotalProfit) corteTotalProfit.textContent = formatMoney(totals.totalProfit);
        if (corteModal) corteModal.classList.add('active');
    }

    if (btnCorte) btnCorte.addEventListener('click', openCorteModal);
    if (btnCloseCorte) btnCloseCorte.addEventListener('click', () => corteModal.classList.remove('active'));

    function printCorteTicket(totals, isCompleto) {
        const tipo = isCompleto ? "CORTE COMPLETO (Z)" : "CORTE PARCIAL (X)";
        const date = new Date().toLocaleString();

        let ticketsListHtml = '';
        if (salesHistory.length > 0) {
            ticketsListHtml += '<tr><td colspan="2"><div class="divider" style="margin: 5px 0;"></div></td></tr>';
            ticketsListHtml += '<tr><td colspan="2" style="font-weight:bold; text-align:center;">Detalle de Ventas (Tickets)</td></tr>';
            
            salesHistory.forEach((sale, index) => {
                const num = index + 1;
                ticketsListHtml += `<tr><td>Ticket-${num.toString().padStart(3, '0')}:</td><td class="text-right">${formatMoney(sale.total)}</td></tr>`;
            });

            ticketsListHtml += '<tr><td colspan="2"><div class="divider" style="margin: 5px 0;"></div></td></tr>';
            ticketsListHtml += '<tr><td colspan="2" style="font-weight:bold; text-align:center;">Artículos Vendidos</td></tr>';
            
            let soldItems = {};
            salesHistory.forEach(sale => {
                sale.items.forEach(item => {
                    if (!soldItems[item.id]) {
                        soldItems[item.id] = { name: item.name, qty: 0, total: 0 };
                    }
                    soldItems[item.id].qty += item.qty;
                    soldItems[item.id].total += (item.price * item.qty);
                });
            });
            
            Object.values(soldItems).forEach(item => {
                ticketsListHtml += `<tr><td>${item.qty}x ${item.name.substring(0,18)}</td><td class="text-right">${formatMoney(item.total)}</td></tr>`;
            });
        }

        const cashierName = currentUser ? (currentUser.username || currentUser.fullName) : 'Admin';
        const coworkerName = currentUser2 ? ' / ' + (currentUser2.username || currentUser2.fullName) : '';

        const content = `
            <div class="header">
                <h1>REALPHONE</h1>
                <p>by Telcel</p>
                <p>Sucursal: ${currentBranch || 'N/A'}</p>
                <p style="font-size:10px;">${getStoreAddress()}</p>
                <p style="font-weight:bold; margin-top: 5px;">${tipo}</p>
                <p>Fecha: ${date}</p>
            </div>
            <div class="divider"></div>
            <div style="margin-bottom: 5px;"><strong>En turno:</strong> ${cashierName}${coworkerName}</div>
            <div class="divider"></div>
            <table>
                <tr><td>Ventas Realizadas:</td><td class="text-right font-bold">${salesHistory.length}</td></tr>
                <tr><td>Artículos Vendidos:</td><td class="text-right">${totals.totalItems}</td></tr>
                <tr><td>Ganancia Estimada:</td><td class="text-right">${formatMoney(totals.totalProfit)}</td></tr>
                ${ticketsListHtml}
                <tr><td colspan="2"><div class="divider" style="margin: 5px 0;"></div></td></tr>
                <tr><td class="font-bold" style="font-size: 16px;">TOTAL EN CAJA:</td><td class="text-right font-bold" style="font-size: 16px;">${formatMoney(totals.totalSales)}</td></tr>
            </table>
        `;
        printTicketHTML(content);
    }

    const btnCorteParcial = document.getElementById('btnCorteParcial');
    if (btnCorteParcial) {
        btnCorteParcial.addEventListener('click', function() {
            const totals = calculateCorte();
            printCorteTicket(totals, false);
            showToast('Corte Parcial impreso', 'info');
        });
    }

    const btnCorteCompleto = document.getElementById('btnCorteCompleto');
    if (btnCorteCompleto) {
        btnCorteCompleto.addEventListener('click', function() {
            const totals = calculateCorte();
            if (confirm('¿ESTÁS SEGURO DE HACER CORTE COMPLETO?\\n\\nSe reiniciarán las ventas a $0.00.\\nEl ticket se imprimirá a continuación.')) {
                printCorteTicket(totals, true);
                salesHistory = [];
                saveData();
                showToast('✅ Corte Completo realizado. Caja en $0.00', 'success');
                corteModal.classList.remove('active');
            }
        });
    }

    // ==================== FIREBASE AUTH SYNC ====================
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js").then(({ initializeApp }) => {
        import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js").then(({ getFirestore, collection, onSnapshot }) => {
            try {
                const firebaseConfig = {
                    apiKey: "AIzaSyAziX2ZYthQ6jMN9t5KoEk1qb88ZT29OMU",
                    authDomain: "realphone-tickets.firebaseapp.com",
                    projectId: "realphone-tickets",
                    storageBucket: "realphone-tickets.firebasestorage.app",
                    messagingSenderId: "461224250452",
                    appId: "1:461224250452:web:9d2ed52a0e880c3e45f1c1"
                };
                const app = initializeApp(firebaseConfig);
                const db = getFirestore(app);
                onSnapshot(collection(db, "users"), (snapshot) => {
                    const fbUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    if (fbUsers.length > 0) {
                        users = fbUsers.map(u => ({
                            id: u.id,
                            username: u.username,
                            password: u.password,
                            role: u.role,
                            fullName: u.username, 
                            branch: 'principal',
                            active: true
                        }));
                        localStorage.setItem('realphone_users', JSON.stringify(users));
                        console.log("Usuarios sincronizados desde Firebase");
                    }
                });
            } catch(e) {
                console.error("Error inicializando Firebase:", e);
            }
        }).catch(e => console.error("Error importando firestore", e));
    }).catch(e => console.error("Error importando firebase-app", e));

})();
