// --- Configuration Keys (Updated for Category Budgets) ---
const CATEGORY_BUDGETS_KEY = 'monitorApp_category_budgets'; // New key for category budgets
const TRANSACTIONS_KEY = 'monitorApp_current_transactions';
const MONTHLY_RECORDS_KEY = 'monitorApp_monthly_history';
const CURRENT_CYCLE_MONTH_KEY = 'monitorApp_current_cycle_month';

// --- Global State Variables (Updated) ---
let categoryBudgets = {}; // Stores budgets: { "Administrative": 5000, "Rent / Lease": 15000, ... }
let currentTransactions = []; 
let monthlyRecords = []; 
let totalIncome = 0;
let totalExpenses = 0;
let netFlow = 0; 
let totalBudget = 0; // Derived from summing categoryBudgets
let currentView = 'current';
let currentCycleMonth = new Date().toISOString().substring(0, 7); 

// --- Category Definitions (Retained) ---
const INCOME_CATEGORIES = [
    "Sales / Revenue",
    "Other Income"
];

const EXPENSE_CATEGORIES = [
    "Inventory Cost / Service Cost",
    "Administrative",
    "Rent / Lease",
    "Marketing",
    "Salaries & Benefits",
    "Transportation / Logistics"
];

const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

// --- DOM Elements (Retained) ---
const appContainer = document.getElementById('app-container');

// ----------------------------------------------------------------------
// --- Helper Functions (Updated) ---
// ----------------------------------------------------------------------

/**
 * Formats a number as Philippine Peso (PHP) currency.
 */
const formatCurrency = (amount) => {
    const absoluteAmount = Math.abs(amount);
    return new Intl.NumberFormat('fil-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2
    }).format(absoluteAmount);
};

/**
 * Generates a simple unique ID for local storage transactions.
 */
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

/**
 * Loads data from localStorage. (Updated to load categoryBudgets)
 */
const loadData = () => {
    currentCycleMonth = localStorage.getItem(CURRENT_CYCLE_MONTH_KEY) || new Date().toISOString().substring(0, 7);

    // Load Category Budgets
    try {
        categoryBudgets = JSON.parse(localStorage.getItem(CATEGORY_BUDGETS_KEY) || '{}');
        // Ensure budgets are parsed as numbers
        for (const cat in categoryBudgets) {
            categoryBudgets[cat] = parseFloat(categoryBudgets[cat]);
        }
    } catch (e) {
        console.error("Error loading category budgets:", e);
        categoryBudgets = {};
    }

    const loadArray = (key) => {
        try {
            const rawData = JSON.parse(localStorage.getItem(key) || '[]');
            return rawData.map(t => ({
                ...t,
                amount: parseFloat(t.amount),
                type: t.type || 'expense', 
                category: t.category && ALL_CATEGORIES.includes(t.category) ? t.category : (t.type === 'income' ? 'Other Income' : 'Administrative'),
                date: t.date || new Date().toISOString().split('T')[0],
                createdAt: t.createdAt || new Date().toISOString()
            }));
        } catch (e) {
            console.error(`Error loading data for key ${key}:`, e);
            return [];
        }
    };

    currentTransactions = loadArray(TRANSACTIONS_KEY);
    monthlyRecords = loadArray(MONTHLY_RECORDS_KEY);
};

/**
 * Saves all current state data to localStorage. (Updated to save categoryBudgets)
 */
const saveData = () => {
    localStorage.setItem(CATEGORY_BUDGETS_KEY, JSON.stringify(categoryBudgets)); // Save category budgets
    localStorage.setItem(CURRENT_CYCLE_MONTH_KEY, currentCycleMonth);

    const sortedTransactions = currentTransactions.sort((a, b) => {
        if (a.date !== b.date) {
            return new Date(b.date) - new Date(a.date);
        }
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(sortedTransactions));

    const sortedRecords = monthlyRecords.sort((a, b) => new Date(b.month) - new Date(a.month));
    localStorage.setItem(MONTHLY_RECORDS_KEY, JSON.stringify(sortedRecords));
};

/**
 * Calculates total income, expenses, and net flow for the current cycle. (Updated to derive totalBudget)
 */
const calculateTotals = () => {
    totalIncome = currentTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    totalExpenses = currentTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
        
    // NEW: Calculate Total Budget by summing up all category budgets
    totalBudget = EXPENSE_CATEGORIES.reduce((sum, category) => sum + (categoryBudgets[category] || 0), 0);
    
    // Total Budget Variance (Overall)
    const totalBudgetVariance = totalBudget - totalExpenses;
    
    // Net Flow calculation: Total Income - Total Expenses
    netFlow = totalIncome - totalExpenses;

    return { totalIncome, totalExpenses, totalBudget, totalBudgetVariance, netFlow };
};

/**
 * Calculates expense totals by category and returns sorted data. (Retained)
 */
const calculateCategoryExpenses = () => {
    const expenseTransactions = currentTransactions.filter(t => t.type === 'expense');

    const categorySummary = expenseTransactions
        .reduce((acc, t) => {
            if (EXPENSE_CATEGORIES.includes(t.category)) {
                acc[t.category] = (acc[t.category] || 0) + t.amount;
            }
            return acc;
        }, {});

    // Include all expense categories, even those with zero spending/budget
    return EXPENSE_CATEGORIES.map(category => {
        const spent = categorySummary[category] || 0;
        const budget = categoryBudgets[category] || 0;
        const variance = budget - spent;
        
        return { 
            category, 
            amountSpent: spent, 
            budget: budget, 
            variance: variance 
        };
    }).sort((a, b) => b.amountSpent - a.amountSpent);
};


// ----------------------------------------------------------------------
// --- Action Functions (New: saveCategoryBudgets) ---
// ----------------------------------------------------------------------

/**
 * NEW: Saves or updates category budgets from the form.
 */
const saveCategoryBudgets = (event) => {
    event.preventDefault();
    const form = event.target;
    let newBudgets = { ...categoryBudgets };
    let valid = true;

    EXPENSE_CATEGORIES.forEach(category => {
        const input = form.querySelector(`#budget-input-${category.replace(/[^a-zA-Z0-9]/g, '')}`);
        if (input) {
            const amount = parseFloat(input.value) || 0;
            if (isNaN(amount) || amount < 0) {
                alert(`Please enter a valid non-negative number for ${category}.`);
                valid = false;
            }
            newBudgets[category] = amount;
        }
    });

    if (valid) {
        categoryBudgets = newBudgets;
        renderApp();
        renderCategoryBudgetSetter(false); // Switch back to read view
    }
};

const addTransaction = (event) => {
    event.preventDefault();

    const form = event.target;
    const type = form.querySelector('input[name="transaction-type"]:checked').value;
    const description = form.querySelector('#transaction-description-input').value.trim();
    const amount = parseFloat(form.querySelector('#transaction-amount-input').value);
    const category = form.querySelector('#transaction-category-select').value;
    const date = form.querySelector('#transaction-date-input').value;

    if (!description || isNaN(amount) || amount <= 0 || !date || !category) {
        alert("Please ensure all fields are valid: description, positive amount, date, and category.");
        return;
    }
    
    // VALIDATION LOGIC (Retained)
    if (type === 'expense' && !EXPENSE_CATEGORIES.includes(category)) {
         alert(`Error: Cannot log an EXPENSE with an INCOME category (${category}). Please select a valid Expense category.`);
         return;
    }
    if (type === 'income' && !INCOME_CATEGORIES.includes(category)) {
         alert(`Error: Cannot log an INCOME with an EXPENSE category (${category}). Please select a valid Income category.`);
         return;
    }
    // ----------------------------

    const newTransaction = {
        id: generateId(),
        type: type, // 'income' or 'expense'
        description: description,
        amount: amount,
        category: category,
        date: date,
        createdAt: new Date().toISOString()
    };

    currentTransactions.unshift(newTransaction);

    // Reset form fields
    form.reset();
    form.querySelector('#transaction-date-input').value = new Date().toISOString().split('T')[0];
    form.querySelector('#transaction-category-select').selectedIndex = 0; 
    form.querySelector('input[name="transaction-type"][value="expense"]').checked = true;
    
    updateCategoryDropdown('expense'); 

    renderApp();
};

const deleteTransaction = (id) => {
    if (!confirm("Are you sure you want to delete this transaction?")) {
        return;
    }
    currentTransactions = currentTransactions.filter(t => t.id !== id);
    renderApp();
};

const finalizeMonth = () => {
    const { totalIncome: finalIncome, totalExpenses: finalExpenses, netFlow: finalNetFlow, totalBudget: finalBudget } = calculateTotals();

    if (!confirm(`Finalize cycle for ${currentCycleMonth}? This archives all current data.`)) {
        return;
    }

    // Capture category budget variance at the time of archival
    const categorySummaryArray = calculateCategoryExpenses();
    const categorySummaryObject = categorySummaryArray.reduce((acc, item) => {
        // Only store budget, spent, and variance, indexed by category
        acc[item.category] = {
            budget: item.budget,
            spent: item.amountSpent,
            variance: item.variance
        };
        return acc;
    }, {});


    const newRecord = {
        id: generateId(),
        month: currentCycleMonth,
        startingBudget: finalBudget, // Save the aggregate budget
        totalIncome: finalIncome,
        totalExpenses: finalExpenses,
        netFlow: finalNetFlow,
        categorySummary: categorySummaryObject, // Now stores detailed budget/spent/variance
        transactions: [...currentTransactions]
    };

    monthlyRecords.unshift(newRecord);

    // Reset for new month
    categoryBudgets = {}; // Reset category budgets
    currentTransactions = [];

    // Set next cycle month
    const currentMonthDate = new Date(currentCycleMonth);
    const nextMonth = new Date(currentMonthDate.setMonth(currentMonthDate.getMonth() + 1));
    currentCycleMonth = nextMonth.toISOString().substring(0, 7);

    renderApp();
    renderCategoryBudgetSetter(true);

    const container = document.getElementById('finalize-status');
    if (container) {
        container.innerHTML = '<p style="color: var(--success-complement); font-weight: 600;">✅ Cycle Finalized! Start setting up your new month.</p>';
        setTimeout(() => container.innerHTML = '', 4000);
    }
};

// ----------------------------------------------------------------------
// --- UI RENDERING (MAJOR UPDATES) ---
// ----------------------------------------------------------------------

/**
 * Updates the category dropdown options based on transaction type. (Retained)
 */
const updateCategoryDropdown = (type) => {
    const selectElement = document.getElementById('transaction-category-select');
    if (!selectElement) return;

    let categoriesToDisplay = [];
    let optgroupLabel = '';
    let categoryType = '';

    if (type === 'income') {
        categoriesToDisplay = INCOME_CATEGORIES;
        optgroupLabel = 'INCOME Categories';
        categoryType = 'income';
    } else { 
        categoriesToDisplay = EXPENSE_CATEGORIES;
        optgroupLabel = 'EXPENSE Categories';
        categoryType = 'expense';
    }

    const optionsMarkup = categoriesToDisplay.map(cat => {
        const color = categoryType === 'income' ? 'var(--income-color)' : 'var(--expense-color)';
        return `<option value="${cat}" style="color: ${color};">${cat}</option>`;
    }).join('');

    selectElement.innerHTML = `
        <option value="" disabled selected>Select Category</option>
        <optgroup label="${optgroupLabel}">
            ${optionsMarkup}
        </optgroup>
    `;
};


/**
 * Attaches event listeners to the Income/Expense radio buttons. (Retained)
 */
const setupTransactionTypeListener = () => {
    const radioButtons = document.querySelectorAll('input[name="transaction-type"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', (event) => {
            updateCategoryDropdown(event.target.value);
        });
    });
    
    updateCategoryDropdown(document.querySelector('input[name="transaction-type"]:checked').value);
};


/**
 * Renders a horizontal bar graph showing Total Budget vs. Total Expenses. (Updated Logic)
 */
const renderBudgetVisualization = () => {
    const { totalExpenses: exp, totalBudget: budget, totalBudgetVariance: variance } = calculateTotals();
    const isOver = variance < 0;
    const monthlyBudgetDisplay = budget;

    // 1. Handle Zero/No Budget Case
    if (monthlyBudgetDisplay <= 0 && exp === 0) {
        return `
            <div style="text-align: center; padding: 24px; width: 100%;">
                <h3 style="color: var(--primary-orange);">Category Budgets Not Set</h3>
                <p style="opacity: 0.8;">Set your category budgets in the sidebar to view utilization.</p>
            </div>
        `;
    }

    // 2. Calculate percentages and define colors
    const spentPercentage = monthlyBudgetDisplay > 0 ? (exp / monthlyBudgetDisplay) * 100 : (exp > 0 ? 100 : 0);
    const normalizedSpent = Math.min(100, spentPercentage);
    const overspentAmount = Math.abs(variance);
    const remainingAmount = variance;

    const spentColor = 'var(--expense-color)';
    const overColor = 'var(--primary-orange)';
    const remainingColor = 'var(--income-color)';

    const varianceLabel = isOver 
        ? `<span style="color: ${overColor}; font-weight: 700;">- ${formatCurrency(overspentAmount)} OVER BUDGET</span>`
        : `<span style="color: ${remainingColor}; font-weight: 700;">${formatCurrency(remainingAmount)} REMAINING</span>`;
    
    // 3. Build HTML Markup for the Horizontal Bar Chart
    let barMarkup;
    if (isOver) {
         // If over budget, show a full bar for budget
        barMarkup = `
            <div style="height: 20px; background-color: ${spentColor}; width: 100%; border-radius: 4px; position: relative;">
                 <span style="
                    position: absolute; 
                    top: 50%; 
                    right: 8px; 
                    transform: translateY(-50%); 
                    font-size: 0.8rem; 
                    font-weight: 800; 
                    color: var(--light-text); 
                    text-shadow: 1px 1px 2px #000;
                    z-index: 20;
                ">
                    100%
                </span>
            </div>
            <p style="text-align: left; font-size: 0.8rem; margin-top: 4px; color: ${overColor}; font-weight: 600;">
                 ${(spentPercentage).toFixed(1)}% of budget spent. (Exceeded budget amount).
            </p>
        `;
    } else {
        // Normal scenario: Expenses within budget
        barMarkup = `
            <div style="height: 20px; background-color: var(--olive-tint); width: 100%; border-radius: 4px; position: relative;">
                <div style="
                    height: 100%;
                    width: ${normalizedSpent.toFixed(1)}%;
                    background-color: ${spentColor};
                    border-radius: 4px;
                    transition: width 0.5s;
                "></div>
                <span style="
                    position: absolute; 
                    top: 50%; 
                    left: ${Math.max(10, normalizedSpent.toFixed(1) - 5)}%; 
                    transform: translateY(-50%); 
                    font-size: 0.8rem; 
                    font-weight: 800; 
                    color: var(--light-text); 
                    text-shadow: 1px 1px 2px #000;
                    z-index: 20;
                ">
                    ${normalizedSpent.toFixed(1)}%
                </span>
            </div>
        `;
    }


    return `
        <div style="display: flex; flex-direction: column; width: 100%; padding: 12px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 0.9rem; font-weight: 600;">Total Budget: ${formatCurrency(monthlyBudgetDisplay)}</span>
                <span style="font-size: 0.9rem; font-weight: 600;">Total Expenses: ${formatCurrency(exp)}</span>
            </div>

            ${barMarkup}

            <p style="text-align: center; font-size: 1rem; font-weight: 700; margin-top: 16px;">
                ${varianceLabel}
            </p>
        </div>
    `;
};


/**
 * Renders the Category Budget Setter card. (NEW)
 */
const renderCategoryBudgetSetter = (isEditing = false) => {
    const container = document.getElementById('budget-setter-card');
    if (!container) return;
    
    const { totalBudget } = calculateTotals();
    const totalBudgetDisplay = formatCurrency(totalBudget);

    if (isEditing) {
        const inputFields = EXPENSE_CATEGORIES.map(category => {
            const safeId = category.replace(/[^a-zA-Z0-9]/g, '');
            const currentValue = categoryBudgets[category] !== undefined ? categoryBudgets[category].toFixed(2) : '0.00';
            
            return `
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 0.9rem; display: block; margin-bottom: 4px; font-weight: 600;">${category}</label>
                    <input type="number" id="budget-input-${safeId}" 
                           placeholder="Budget for ${category}" 
                           value="${currentValue}" 
                           min="0" step="0.01" required />
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; border-bottom: 1px solid var(--olive-tint); padding-bottom: 8px;">
                Set Category Budgets
            </h2>
            <form id="set-budget-form">
                <div style="max-height: 250px; overflow-y: auto; padding-right: 10px; margin-bottom: 16px;">
                    ${inputFields}
                </div>
                <button type="submit" class="btn btn-success" style="width: 100%;">Save All Budgets</button>
            </form>
        `;
        document.getElementById('set-budget-form').addEventListener('submit', saveCategoryBudgets);
        
    } else {
        // Read-only view
        const budgetList = EXPENSE_CATEGORIES.map(category => {
            const budget = categoryBudgets[category] || 0;
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.9rem; padding: 4px 0; border-bottom: 1px dashed var(--olive-tint);">
                    <span>${category}</span>
                    <span style="font-weight:bold;">${formatCurrency(budget)}</span>
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h2 style="font-size: 0.9rem; opacity:0.7; margin-bottom:4px;">TOTAL MONTHLY BUDGET</h2>
                    <div style="font-size: 1.5rem; font-weight:bold; color:var(--primary-orange);">${totalBudgetDisplay}</div>
                </div>
                <button id="edit-budget-btn" class="btn btn-primary">Edit</button>
            </div>
            <div style="margin-top: 15px; max-height: 150px; overflow-y: auto;">
                ${budgetList}
            </div>
        `;
        document.getElementById('edit-budget-btn').addEventListener('click', () => renderCategoryBudgetSetter(true));
    }
};


/**
 * Renders the horizontal bar chart for category expenses. (Updated to include budget and variance)
 */
const renderCategoryBreakdownChart = () => {
    const sortedExpenses = calculateCategoryExpenses();
    const totalBudget = calculateTotals().totalBudget; // Overall Total Budget Display

    if (sortedExpenses.length === 0 || totalBudget === 0) {
        return `
            <div style="text-align: center; padding: 24px; color: var(--subtle-gray); opacity: 0.7;">
                <p>Set category budgets and log expenses to see the breakdown.</p>
            </div>
        `;
    }

    const chartBars = sortedExpenses.map(item => {
        const { category, amountSpent, budget, variance } = item;
        
        // 1. Calculate bar width relative to the CATEGORY's budget
        const spentPercentageOfBudget = budget > 0 ? (amountSpent / budget) * 100 : (amountSpent > 0 ? 100 : 0);
        const normalizedSpent = Math.min(100, spentPercentageOfBudget);
        
        // 2. Determine variance display
        const isOverspent = variance < 0;
        const varianceText = isOverspent ? 
            `<span style="color: var(--primary-orange);">- ${formatCurrency(variance)} Over</span>` :
            `<span style="color: var(--success-complement);">${formatCurrency(variance)} Left</span>`;

        // 3. Determine bar color
        const spentColor = isOverspent ? 'var(--primary-orange)' : 'var(--expense-color)';
        
        // If over budget, the bar represents 100% of the category budget, but the background highlights it's 100% full.
        const barWidth = isOverspent ? '100%' : `${normalizedSpent.toFixed(1)}%`;
        const barContainerBg = isOverspent ? 'var(--primary-orange)' : 'var(--olive-tint)';
        const barActualFill = isOverspent ? 'var(--hover-orange)' : spentColor;
        
        return `
            <div style="margin-bottom: 18px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px;">
                    <span style="font-weight: 600;">${category}</span>
                    <span style="font-weight: 700;">
                        Spent: ${formatCurrency(amountSpent)} / Budget: ${formatCurrency(budget)}
                    </span>
                </div>
                
                <div style="height: 12px; background-color: ${barContainerBg}; border-radius: 5px; position: relative; overflow: hidden;">
                    <div style="
                        height: 100%;
                        width: ${barWidth};
                        background-color: ${barActualFill};
                        border-radius: 5px;
                        transition: width 0.5s;
                    " title="Spent: ${spentPercentageOfBudget.toFixed(1)}%"></div>
                </div>
                
                <div style="text-align: right; margin-top: 4px; font-size: 0.85rem;">
                    ${varianceText}
                </div>
            </div>
        `;
    }).join('');

    return `
        <h3 style="font-size: 1rem; font-weight: 700; margin-bottom: 12px; color: var(--white-text);">
            TOTAL EXPENSE BUDGET: ${formatCurrency(totalBudget)}
        </h3>
        <div id="category-chart-container" style="padding-top: 8px;">
            ${chartBars}
        </div>
    `;
};


/**
 * Renders the SVG Donut Chart for category expenses. (Updated to use derived category data)
 */
const renderCategoryDonutChart = () => {
    const sortedExpenses = calculateCategoryExpenses().filter(item => item.amountSpent > 0);
    const totalExpensesValue = totalExpenses;

    if (totalExpensesValue === 0) {
        return `
            <div style="text-align: center; padding: 24px; height: 100%;">
                <p style="color: var(--subtle-gray); opacity: 0.8; margin-top: 50px;">Log expenses to see category proportion.</p>
            </div>
        `;
    }
    
    // Simple color palette for the slices
    const chartColors = [
        '#FBA002', '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
        '#9966FF', '#FF9F40', '#E7E9ED', '#4D5360', '#6A5ACD'
    ];

    const radius = 50;
    const center = 50;
    const circumference = 2 * Math.PI * radius;
    let cumulativePercent = 0;

    const slices = sortedExpenses.slice(0, 7).map((item, index) => {
        const percent = item.amountSpent / totalExpensesValue;
        const segmentLength = percent * circumference;
        const dashoffset = circumference - (cumulativePercent * circumference);
        const color = chartColors[index % chartColors.length];
        
        cumulativePercent += percent;

        // Path is rotated based on the previous segments
        return `
            <circle cx="${center}" cy="${center}" r="${radius}" fill="transparent" stroke="${color}" stroke-width="20"
                stroke-dasharray="${segmentLength} ${circumference}"
                stroke-dashoffset="${dashoffset}"
                style="transform: rotate(-90deg); transform-origin: ${center}px ${center}px;"
                title="${item.category}: ${percent.toFixed(2) * 100}%" />
        `;
    }).join('');

    const legend = sortedExpenses.slice(0, 7).map((item, index) => `
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
            <span style="width: 10px; height: 10px; background-color: ${chartColors[index % chartColors.length]}; border-radius: 50%; margin-right: 8px;"></span>
            <span style="font-size: 0.85rem; color: var(--light-text);">${item.category}: ${(item.amountSpent / totalExpensesValue * 100).toFixed(1)}%</span>
        </div>
    `).join('');
    
    // Calculate 'Other' category if there are more than 7 categories
    let otherSlice = '';
    if (sortedExpenses.length > 7) {
        const otherAmount = sortedExpenses.slice(7).reduce((sum, item) => sum + item.amountSpent, 0);
        const otherPercent = otherAmount / totalExpensesValue;
        const otherColor = chartColors[7];
        
        const segmentLength = otherPercent * circumference;
        const dashoffset = circumference - (cumulativePercent * circumference);

        otherSlice = `
            <circle cx="${center}" cy="${center}" r="${radius}" fill="transparent" stroke="${otherColor}" stroke-width="20"
                stroke-dasharray="${segmentLength} ${circumference}"
                stroke-dashoffset="${dashoffset}"
                style="transform: rotate(-90deg); transform-origin: ${center}px ${center}px;"
                title="Other: ${otherPercent.toFixed(2) * 100}%" />
        `;

        legend += `
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
                <span style="width: 10px; height: 10px; background-color: ${otherColor}; border-radius: 50%; margin-right: 8px;"></span>
                <span style="font-size: 0.85rem; color: var(--light-text);">Other: ${(otherPercent * 100).toFixed(1)}%</span>
            </div>
        `;
    }


    return `
        <div style="display: flex; flex-direction: row; justify-content: center; align-items: center; gap: 20px; width: 100%; flex-wrap: wrap;">
            <div style="width: 150px; height: 150px; flex-shrink: 0;">
                <svg viewBox="0 0 100 100" width="100%" height="100%">
                    <circle cx="${center}" cy="${center}" r="${radius}" fill="transparent" stroke="var(--olive-tint)" stroke-width="20" />
                    ${slices}
                    ${otherSlice}
                    <text x="${center}" y="${center + 5}" text-anchor="middle" dominant-baseline="middle" style="font-size: 10px; font-weight: 800; fill: var(--white-text);">
                        ${formatCurrency(totalExpensesValue)}
                    </text>
                </svg>
            </div>
            <div style="padding: 10px; max-width: 50%; min-width: 150px;">
                <h4 style="margin-top: 0; color: var(--primary-orange);">Top Expense Categories</h4>
                ${legend}
            </div>
        </div>
    `;
};


/**
 * Main render function to update the entire application UI structure. (Updated to use totalBudget)
 */
const renderApp = () => {
    const { totalIncome: inc, totalExpenses: exp, netFlow: flow, totalBudget: budget } = calculateTotals();
    const isNetFlowPositive = flow >= 0;
    const netFlowCardClasses = isNetFlowPositive ? 'net-flow-positive-item' : 'net-flow-negative-item';
    const totalBudgetVariance = budget - exp;
    const isOverBudget = totalBudgetVariance < 0;

    // Format current cycle month for display
    const displayMonth = new Date(currentCycleMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });


    appContainer.innerHTML = `
        <h1 class="app-header">
            <span style="font-size: 2rem; margin-right: 8px; font-weight: bold;"></span>
            Expense Monitor Dashboard (${displayMonth})
        </h1>
        
        <section id="summary-section" class="card">
            <div id="visualization-container">
                ${renderBudgetVisualization()}
            </div>
            <div id="summary-grid">
                <div class="summary-item budget-item">
                    <h2>TOTAL MONTHLY BUDGET</h2>
                    <p id="total-budget-display">
                        ${formatCurrency(budget)}
                    </p>
                </div>
                <div class="summary-item income-item-summary">
                    <h2>TOTAL INCOME</h2>
                    <p id="total-income-display">
                        ${formatCurrency(inc)}
                    </p>
                </div>
                <div class="summary-item expense-item-summary">
                    <h2>TOTAL EXPENSES</h2>
                    <p id="total-expenses-display">
                        ${formatCurrency(exp)}
                    </p>
                </div>
                <div class="summary-item ${isOverBudget ? 'net-flow-negative-item' : 'net-flow-positive-item'}">
                    <h2>BUDGET REMAINING</h2>
                    <p id="net-flow-display">
                        ${isOverBudget ? '-' : ''}${formatCurrency(totalBudgetVariance)}
                    </p>
                </div>
            </div>
        </section>

        <div id="tab-bar">
            <button id="tab-current-btn" class="tab-btn ${currentView === 'current' ? 'active' : ''}">
                <i class="bi bi-speedometer2" style="margin-right: 8px;"></i> Active Dashboard
            </button>
            <button id="tab-history-btn" class="tab-btn ${currentView === 'history' ? 'active' : ''}">
                <i class="bi bi-archive" style="margin-right: 8px;"></i> Monthly History (${monthlyRecords.length} Cycles)
            </button>
        </div>

        <div id="view-content-container">
        </div>
    `;

    // --- 2. Attach Dynamic Renderers/Listeners ---
    attachViewEventListeners();
    renderActiveView();
    saveData();
};

const attachViewEventListeners = () => {
    document.getElementById('tab-current-btn').addEventListener('click', () => switchToView('current'));
    document.getElementById('tab-history-btn').addEventListener('click', () => switchToView('history'));
};

const switchToView = (view) => {
    if (currentView !== view) {
        currentView = view;
        renderApp();
    }
};

const renderActiveView = () => {
    const container = document.getElementById('view-content-container');
    if (!container) return;

    container.innerHTML = '';

    if (currentView === 'current') {
        container.innerHTML = renderCurrentMonthManager();

        // Attach logic
        document.getElementById('set-cycle-month-btn').addEventListener('click', setCycleMonth);
        // Renders the Category Budget Setter
        renderCategoryBudgetSetter(false); 
        document.getElementById('add-transaction-form').addEventListener('submit', addTransaction);
        
        // Default to today's date
        document.getElementById('transaction-date-input').value = new Date().toISOString().split('T')[0];

        document.getElementById('finalize-month-btn').addEventListener('click', finalizeMonth);
        
        // Render the charts and transaction list
        document.getElementById('category-breakdown-container').innerHTML = renderCategoryBreakdownChart(); 
        
        setupTransactionTypeListener(); 
        
        renderTransactionHistory();

    } else {
        container.innerHTML = renderMonthlyHistory();
    }
};

const setCycleMonth = () => {
    const input = document.getElementById('cycle-month-input');
    const newMonth = input.value;

    if (!newMonth) return;

    if (newMonth !== currentCycleMonth) {
        currentCycleMonth = newMonth;
        renderApp();
    }
};

// --- Current Month Dashboard Components (Updated) ---

const renderCurrentMonthManager = () => {
    const today = new Date().toISOString().split('T')[0];
    const displayMonth = new Date(currentCycleMonth + '-01').toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    return `
        <div id="current-dashboard-grid">
            
            <div id="dashboard-main-column">
                
                <section class="card" id="add-transaction-card">
                    <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; border-bottom: 1px solid var(--olive-tint); padding-bottom: 8px;">
                        Log New Transaction
                    </h2>
                    <form id="add-transaction-form" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
                        <div style="grid-column: span 4; display: flex; gap: 16px;">
                            <label style="font-weight: 600;">
                                <input type="radio" name="transaction-type" value="expense" checked style="margin-right: 8px;" />
                                Expense (<span style="color:var(--expense-color);">Outflow</span>)
                            </label>
                            <label style="font-weight: 600;">
                                <input type="radio" name="transaction-type" value="income" style="margin-right: 8px;" />
                                Income (<span style="color:var(--income-color);">Inflow</span>)
                            </label>
                        </div>

                        <input type="text" id="transaction-description-input" placeholder="Description/Merchant" required style="grid-column: span 2;" />
                        
                        <input type="number" id="transaction-amount-input" placeholder="Amount (150.75)"
                            min="0.01" step="0.01" required />
                        
                        <select id="transaction-category-select" required>
                            <option value="" disabled selected>Select Category</option>
                        </select>
                        
                        <input type="date" id="transaction-date-input" style="grid-column: span 2;" max="${today}" required />

                        <button type="submit" class="btn btn-primary" style="grid-column: span 2;">
                            Log Transaction for ${displayMonth}
                        </button>
                    </form>
                </section>
                
                <section class="card" id="category-breakdown-card">
                    <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; border-bottom: 1px solid var(--olive-tint); padding-bottom: 8px;">
                        Expense Budget Breakdown
                    </h2>
                    <div id="category-breakdown-container">
                        </div>
                </section>
                <section class="card" id="transaction-history-card" style="flex-grow: 1;">
                    <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; border-bottom: 1px solid var(--olive-tint); padding-bottom: 8px;">
                        Transaction Log (Current Month)
                    </h2>
                    <div id="history-list-container" style="max-height: 400px; overflow-y: auto;">
                    </div>
                </section>
            </div>

            
            <div id="dashboard-actions-column">
                
                <section id="budget-setter-card" class="card"></section>

                <section class="card" id="date-setter-card">
                    <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 12px; color: var(--primary-orange);">
                        Budget Cycle: ${displayMonth}
                    </h2>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="month" id="cycle-month-input" value="${currentCycleMonth}" style="flex-grow: 1;" required />
                        <button id="set-cycle-month-btn" class="btn btn-success" style="padding: 12px 16px; flex-shrink: 0;">
                            Set
                        </button>
                    </div>
                    <p style="margin-top: 10px; font-size: 0.85rem; color: var(--light-text); opacity: 0.6;">
                        All new transactions will be attributed to this month.
                    </p>
                </section>

                <section class="card" id="finalize-card" style="background-color: var(--olive-tint);">
                    <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--primary-orange); margin-bottom: 16px;">
                        Archive Month
                    </h2>
                    <p style="font-size: 0.9rem; color: var(--light-text); margin-bottom: 12px;">
                        Finalize and archive the current month's transactions and summaries.
                    </p>
                    <button id="finalize-month-btn" class="btn btn-primary" style="width: 100%;">
                        Finalize & Start New Month
                    </button>
                    <div id="finalize-status" style="margin-top: 10px; text-align: center;"></div>
                </section>

            </div>
        </div>
    `;
};

// --- Initialization ---
loadData();
renderApp();