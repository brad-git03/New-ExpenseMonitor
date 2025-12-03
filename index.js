// --- Configuration Keys (GLOBAL SETTINGS) ---
const COMPANY_NAME_KEY = 'monitorApp_company_name';
const CYCLE_TYPE_KEY = 'monitorApp_cycle_type';
const CATEGORY_BUDGETS_KEY = 'monitorApp_category_budgets';
const TRANSACTIONS_KEY = 'monitorApp_current_transactions';
const MONTHLY_RECORDS_KEY = 'monitorApp_cycle_history'; 
const CURRENT_CYCLE_START_KEY = 'monitorApp_current_cycle_start'; 

// --- Global State Variables (MAJOR UPDATE) ---
let companyName = 'Company'; 
let cycleType = 'monthly'; 
let categoryBudgets = {}; 
let currentTransactions = []; 
let monthlyRecords = []; 
let totalIncome = 0;
let totalExpenses = 0;
let netFlow = 0; 
let totalBudget = 0; 
let currentView = 'current';
let currentCycleStart = new Date().toISOString().split('T')[0]; 

// --- Category Definitions ---
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

// --- DOM Elements ---
const appContainer = document.getElementById('app-container');

// ----------------------------------------------------------------------
// --- Helper Functions ---
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
 * Gets the display name for the current cycle period.
 */
const getCycleDisplay = () => {
    const date = new Date(currentCycleStart + 'T00:00:00');
    
    if (cycleType === 'weekly') {
        const end = new Date(date);
        end.setDate(end.getDate() + 6);
        return `Week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }
    
    if (cycleType === 'yearly') {
        return `Year ${date.getFullYear()}`;
    }
    
    // Default: monthly
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};


/**
 * Calculates the next cycle start date based on the current cycle type.
 */
const calculateNextCycleStart = (currentDateString, type) => {
    const currentDate = new Date(currentDateString + 'T00:00:00'); 
    let nextDate = new Date(currentDate);

    if (type === 'weekly') {
        nextDate.setDate(currentDate.getDate() + 7);
    } else if (type === 'monthly') {
        nextDate.setMonth(currentDate.getMonth() + 1);
    } else if (type === 'yearly') {
        nextDate.setFullYear(currentDate.getFullYear() + 1);
    }
    
    return nextDate.toISOString().split('T')[0];
};

/**
 * Loads data from localStorage.
 */
const loadData = () => {
    // Load Settings
    companyName = localStorage.getItem(COMPANY_NAME_KEY) || 'Company';
    cycleType = localStorage.getItem(CYCLE_TYPE_KEY) || 'monthly';
    
    // Cycle Start Date
    currentCycleStart = localStorage.getItem(CURRENT_CYCLE_START_KEY) || new Date().toISOString().split('T')[0];

    // Load Budgets
    try {
        categoryBudgets = JSON.parse(localStorage.getItem(CATEGORY_BUDGETS_KEY) || '{}');
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
 * Saves all current state data to localStorage.
 */
const saveData = () => {
    // Save Settings
    localStorage.setItem(COMPANY_NAME_KEY, companyName);
    localStorage.setItem(CYCLE_TYPE_KEY, cycleType);
    
    // Save Cycle Start Date
    localStorage.setItem(CURRENT_CYCLE_START_KEY, currentCycleStart); 
    
    localStorage.setItem(CATEGORY_BUDGETS_KEY, JSON.stringify(categoryBudgets)); 

    const sortedTransactions = currentTransactions.sort((a, b) => {
        if (a.date !== b.date) {
            return new Date(b.date) - new Date(a.date);
        }
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(sortedTransactions));

    localStorage.setItem(MONTHLY_RECORDS_KEY, JSON.stringify(monthlyRecords)); 
};

/**
 * Calculates total income, expenses, and net flow for the current cycle.
 */
const calculateTotals = () => {
    totalIncome = currentTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    totalExpenses = currentTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
        
    // Total Budget remains the sum of EXPENSE category budgets
    totalBudget = EXPENSE_CATEGORIES.reduce((sum, category) => sum + (categoryBudgets[category] || 0), 0);
    
    const totalBudgetVariance = totalBudget - totalExpenses;
    
    netFlow = totalIncome - totalExpenses;

    return { totalIncome, totalExpenses, totalBudget, totalBudgetVariance, netFlow };
};

/**
 * Calculates expense totals by category and returns sorted data.
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
// --- Action Functions ---
// ----------------------------------------------------------------------

/**
 * Saves budgets for BOTH expense and income categories.
 */
const saveCategoryBudgets = (event) => {
    event.preventDefault();
    const form = event.target;
    let newBudgets = { ...categoryBudgets };
    
    const ALL_BUDGETABLE_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
    let valid = true;

    ALL_BUDGETABLE_CATEGORIES.forEach(category => {
        const safeId = category.replace(/[^a-zA-Z0-9]/g, '');
        const input = form.querySelector(`#budget-input-${safeId}`);
        
        // If input field exists in the form (i.e., it's an Expense Budget, or Income Forecast in edit view)
        if (input) {
            const amount = parseFloat(input.value) || 0;
            if (isNaN(amount) || amount < 0) {
                alert(`Please enter a valid non-negative number for ${category}.`);
                valid = false;
            }
            newBudgets[category] = amount; // Overwrite copied value
        } 
        // If input does NOT exist (i.e., Income Forecast was hidden), the value is retained from the initial copy.
    });

    if (valid) {
        categoryBudgets = newBudgets;
        renderApp();
        renderCategoryBudgetSetter(false); 
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
    
    // VALIDATION LOGIC
    if (type === 'expense' && !EXPENSE_CATEGORIES.includes(category)) {
         alert(`Error: Cannot log an EXPENSE with an INCOME category (${category}). Please select a valid Expense category.`);
         return;
    }
    if (type === 'income' && !INCOME_CATEGORIES.includes(category)) {
         alert(`Error: Cannot log an INCOME with an EXPENSE category (${category}). Please select a valid Income category.`);
         return;
    }

    const newTransaction = {
        id: generateId(),
        type: type, 
        description: description,
        amount: amount,
        category: category,
        date: date,
        createdAt: new Date().toISOString()
    };

    currentTransactions.unshift(newTransaction);

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

/**
 * Finalizes the current cycle and prepares for the next.
 */
const finalizeCycle = () => {
    const { totalIncome: finalIncome, totalExpenses: finalExpenses, netFlow: finalNetFlow, totalBudget: finalBudget } = calculateTotals();

    if (!confirm(`Finalize cycle starting ${new Date(currentCycleStart).toLocaleDateString()}? This archives all current data and starts the next ${cycleType} cycle.`)) {
        return;
    }

    // Capture category budget variance and actual income vs. forecast
    const categorySummaryArray = calculateCategoryExpenses(); 
    const finalSummary = {};
    
    categorySummaryArray.forEach(item => {
        finalSummary[item.category] = {
            budget: item.budget,
            spent: item.amountSpent,
            variance: item.variance
        };
    });
    
    INCOME_CATEGORIES.forEach(category => {
        const forecast = categoryBudgets[category] || 0;
        const actual = currentTransactions
                        .filter(t => t.type === 'income' && t.category === category)
                        .reduce((sum, t) => sum + t.amount, 0);
        
        finalSummary[category] = {
            forecast: forecast,
            actual: actual,
            variance: actual - forecast
        };
    });


    const newRecord = {
        id: generateId(),
        cycleStart: currentCycleStart, 
        cycleType: cycleType, 
        startingBudget: finalBudget,
        totalIncome: finalIncome,
        totalExpenses: finalExpenses,
        netFlow: finalNetFlow,
        categorySummary: finalSummary, 
        transactions: [...currentTransactions]
    };

    monthlyRecords.unshift(newRecord);

    // --- Cycle Advancement ---
    const nextStart = calculateNextCycleStart(currentCycleStart, cycleType);
    currentCycleStart = nextStart;
    
    // Reset for new cycle
    categoryBudgets = {}; 
    currentTransactions = [];

    renderApp();
    renderCategoryBudgetSetter(true);

    const container = document.getElementById('finalize-status');
    if (container) {
        container.innerHTML = '<p style="color: var(--success-complement); font-weight: 600;">✅ Cycle Finalized! Start setting up your new budget.</p>';
        setTimeout(() => container.innerHTML = '', 4000);
    }
};

// ----------------------------------------------------------------------
// --- UI RENDERING & DYNAMIC FUNCTIONS ---
// ----------------------------------------------------------------------

/**
 * Saves company name and cycle type settings.
 */
const saveSettings = (event) => {
    event.preventDefault();
    
    const newCompanyName = document.getElementById('company-name-input').value.trim();
    const newCycleType = document.querySelector('input[name="cycle-type"]:checked').value;
    
    const requiresCycleReset = newCycleType !== cycleType;

    companyName = newCompanyName || 'Company';
    
    if (requiresCycleReset) {
        cycleType = newCycleType;
        if (confirm(`Warning: Changing the cycle type to '${cycleType}' means the current active cycle is now considered invalid. Do you want to reset the current cycle start date to TODAY?`)) {
            currentCycleStart = new Date().toISOString().split('T')[0];
            currentTransactions = []; 
        }
    }

    renderApp();
    renderSettings(false); 
};

/**
 * Renders the Settings Card.
 */
const renderSettings = (isEditing = false) => {
    const container = document.getElementById('settings-card');
    if (!container) return;
    
    const cycleOptions = [
        { value: 'weekly', label: 'Weekly (7 days)' },
        { value: 'monthly', label: 'Monthly (Calendar month)' },
        { value: 'yearly', label: 'Yearly (365 days)' }
    ];

    if (isEditing) {
        const radioInputs = cycleOptions.map(option => `
            <label style="display: block; font-size: 0.9rem;">
                <input type="radio" name="cycle-type" value="${option.value}" ${cycleType === option.value ? 'checked' : ''} style="margin-right: 5px;">
                ${option.label}
            </label>
        `).join('');

        container.innerHTML = `
            <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; border-bottom: 1px solid var(--olive-tint); padding-bottom: 8px;">
                Application Settings
            </h2>
            <form id="settings-form">
                <div style="margin-bottom: 15px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 4px;">Company/Entity Name</label>
                    <input type="text" id="company-name-input" placeholder="e.g., Acme Corp" value="${companyName}" required />
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 8px;">Cycle Period</label>
                    ${radioInputs}
                    <p style="font-size: 0.8rem; opacity: 0.7; margin-top: 8px;">Changing this will redefine the budgeting and archiving period.</p>
                </div>

                <button type="submit" class="btn btn-success" style="width: 100%;">Save Settings</button>
            </form>
        `;
        document.getElementById('settings-form').addEventListener('submit', saveSettings);

    } else {
        const currentCycleLabel = cycleOptions.find(o => o.value === cycleType)?.label || 'Monthly';
        
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h2 style="font-size: 0.9rem; opacity:0.7; margin-bottom:4px;">Entity: ${companyName}</h2>
                    <div style="font-size: 1.5rem; font-weight:bold; color:var(--light-text);">${currentCycleLabel} Cycle</div>
                </div>
                <button id="edit-settings-btn" class="btn btn-primary">Edit</button>
            </div>
        `;
        document.getElementById('edit-settings-btn').addEventListener('click', () => renderSettings(true));
    }
};

/**
 * Updates the category dropdown options based on transaction type.
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
 * Attaches event listeners to the Income/Expense radio buttons.
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
 * Renders a horizontal bar graph showing Total Budget vs. Total Expenses.
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
 * Renders the Category Budget Setter card.
 */
const renderCategoryBudgetSetter = (isEditing = false) => {
    const container = document.getElementById('budget-setter-card');
    if (!container) return;
    
    const { totalBudget } = calculateTotals();
    const totalBudgetDisplay = formatCurrency(totalBudget);

    // Helper function to render input fields for a category list
    const renderCategoryInputs = (categoryList, type) => {
        return categoryList.map(category => {
            const safeId = category.replace(/[^a-zA-Z0-9]/g, '');
            const currentValue = categoryBudgets[category] !== undefined ? categoryBudgets[category].toFixed(2) : '0.00';
            const color = type === 'Income' ? 'var(--income-color)' : 'var(--primary-orange)';
            
            return `
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 0.9rem; display: block; margin-bottom: 4px; font-weight: 600; color: ${color};">${category}</label>
                    <input type="number" id="budget-input-${safeId}" 
                           placeholder="${type} for ${category}" 
                           value="${currentValue}" 
                           min="0" step="0.01" required />
                </div>
            `;
        }).join('');
    };
    
    // Helper function to render the read-only list
    const renderReadonlyList = (categoryList, type) => {
        const isIncome = type === 'Income';
        const color = isIncome ? 'var(--income-color)' : 'var(--primary-orange)';
        
        return categoryList.map(category => {
            const budget = categoryBudgets[category] || 0;
            const actual = currentTransactions
                            .filter(t => t.type === (isIncome ? 'income' : 'expense') && t.category === category)
                            .reduce((sum, t) => sum + t.amount, 0);

            const label = isIncome ? 'Forecast' : 'Budget';

            // Variance calculation: Income (Actual - Forecast); Expense (Budget - Spent)
            const variance = isIncome ? (actual - budget) : (budget - actual);
            const isPositiveVariance = variance >= 0;
            const varianceColor = isPositiveVariance ? 'var(--success-complement)' : 'var(--primary-orange)';
            const varianceText = `${isPositiveVariance ? '+' : '-'}${formatCurrency(variance)}`;
            
            return `
                <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; font-size:0.9rem; padding: 4px 0; border-bottom: 1px dashed var(--olive-tint);">
                    <span style="font-weight: 600;">${category}</span>
                    <span style="font-weight:bold; color: ${color};">${label}: ${formatCurrency(budget)}</span>
                    <span style="color: ${varianceColor};">${varianceText}</span>
                </div>
            `;
        }).join('');
    };

    if (isEditing) {
        // --- EXPENSE_CATEGORIES are ONLY used for the Budget inputs ---
        const expenseInputs = renderCategoryInputs(EXPENSE_CATEGORIES, 'Budget');
        
        // --- Income Forecasts are REMOVED from the editing form as requested ---
        // const incomeInputs = renderCategoryInputs(INCOME_CATEGORIES, 'Forecast');

        container.innerHTML = `
            <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; border-bottom: 1px solid var(--olive-tint); padding-bottom: 8px;">
                Set Financial Goals
            </h2>
            <form id="set-budget-form">
                <div style="max-height: 400px; overflow-y: auto; padding-right: 10px;">
                    
                    <h3 style="font-size: 1.1rem; color: var(--primary-orange); margin-top: 0; padding-top: 10px;">Expense Budgets (Outflow)</h3>
                    ${expenseInputs}

                </div>
                <button type="submit" class="btn btn-success" style="width: 100%; margin-top: 16px;">Save Expense Budgets</button>
            </form>
        `;
        document.getElementById('set-budget-form').addEventListener('submit', saveCategoryBudgets);
        
    } else {
        // Read-only view
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h2 style="font-size: 0.9rem; opacity:0.7; margin-bottom:4px;">TOTAL EXPENSE BUDGET</h2>
                    <div style="font-size: 1.5rem; font-weight:bold; color:var(--primary-orange);">${totalBudgetDisplay}</div>
                </div>
                <button id="edit-budget-btn" class="btn btn-primary">Edit Goals</button>
            </div>


            <h3 style="font-size: 1rem; color: var(--primary-orange); margin-top: 15px; border-top: 1px dashed var(--olive-tint); padding-top: 10px;">Expense Budgets (Variance)</h3>
            <div style="max-height: 150px; overflow-y: auto;">
                ${renderReadonlyList(EXPENSE_CATEGORIES, 'Expense')}
            </div>
        `;
        document.getElementById('edit-budget-btn').addEventListener('click', () => renderCategoryBudgetSetter(true));
    }
};


/**
 * Renders the horizontal bar chart for category expenses.
 */
const renderCategoryBreakdownChart = () => {
    const sortedExpenses = calculateCategoryExpenses();
    const totalBudget = calculateTotals().totalBudget; 

    if (sortedExpenses.length === 0 && totalBudget === 0) {
        return `
            <div style="text-align: center; padding: 24px; color: var(--subtle-gray); opacity: 0.7;">
                <p>Set category budgets and log expenses to see the breakdown.</p>
            </div>
        `;
    }

    const chartBars = sortedExpenses.map(item => {
        const { category, amountSpent, budget, variance } = item;
        
        const spentPercentageOfBudget = budget > 0 ? (amountSpent / budget) * 100 : (amountSpent > 0 ? 100 : 0);
        const normalizedSpent = Math.min(100, spentPercentageOfBudget);
        
        const isOverspent = variance < 0;
        const varianceText = isOverspent ? 
            `<span style="color: var(--primary-orange);">- ${formatCurrency(variance)} Over</span>` :
            `<span style="color: var(--success-complement);">${formatCurrency(variance)} Left</span>`;

        const spentColor = isOverspent ? 'var(--primary-orange)' : 'var(--expense-color)';
        
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
 * Renders the SVG Donut Chart for category expenses. (Intentionally empty)
 */
const renderCategoryDonutChart = () => {
    return ''; 
};


/**
 * Renders the Transaction History.
 */
const renderTransactionHistory = () => {
    const container = document.getElementById('history-list-container');
    if (!container) return;

    if (currentTransactions.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 24px; color: var(--subtle-gray); opacity: 0.7;">
                <p>No transactions logged for this cycle yet.</p>
            </div>
        `;
        return;
    }

    const transactionsByDate = currentTransactions.reduce((acc, t) => {
        const date = t.date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(t);
        return acc;
    }, {});

    const sortedDates = Object.keys(transactionsByDate).sort((a, b) => new Date(b) - new Date(a));

    container.innerHTML = sortedDates.map(date => {
        const displayDate = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        const dateTransactions = transactionsByDate[date].map(item => {
            const isIncome = item.type === 'income';
            const amountClass = isIncome ? 'income-amount' : 'expense-amount';
            const sign = isIncome ? '+' : '-';
            const icon = isIncome ? '<i class="bi bi-arrow-up-circle-fill"></i>' : '<i class="bi bi-arrow-down-circle-fill"></i>';

            return `
                <div class="transaction-item ${item.type}" style="border-left-width: 6px;">
                    <div class="transaction-item-details">
                        <strong>${item.description}</strong>
                        <small>${item.category} | ${new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                    <div class="transaction-amount-actions" style="display:flex; align-items:center; gap:12px;">
                        ${icon}
                        <span class="amount ${amountClass}">${sign} ${formatCurrency(item.amount)}</span>
                        <button class="delete-btn" onclick="deleteTransaction('${item.id}')" title="Delete Entry">
                            <i class="bi bi-trash-fill"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div style="margin-bottom: 16px;">
                <h4 style="margin: 0; padding: 8px 0; border-bottom: 1px dashed var(--olive-tint); font-size: 1rem; color: var(--light-text);">
                    ${displayDate}
                </h4>
                ${dateTransactions}
            </div>
        `;
    }).join('');
};


/**
 * Renders the Cycle History.
 */
const renderMonthlyHistory = () => {
    if (monthlyRecords.length === 0) {
        return `
            <div class="card" style="text-align: center; padding: 40px;">
                <h3 style="color: var(--light-text);">No Cycle Archive Records Found</h3>
                <p style="opacity: 0.7;">Finalize a cycle to see it appear in your history.</p>
            </div>
        `;
    }

    return `
        <div class="card" id="history-archive-card">
            ${monthlyRecords.map(record => {
                const isDeficit = record.netFlow < 0;
                const displayCycleStart = new Date(record.cycleStart + 'T00:00:00').toLocaleDateString();

                // Format category summary for display
                const categoryList = Object.entries(record.categorySummary || {})
                    .sort(([, a], [, b]) => (b.spent || b.actual || 0) - (a.spent || a.actual || 0))
                    .map(([category, data]) => {
                        const isExpense = EXPENSE_CATEGORIES.includes(category);
                        const isIncome = INCOME_CATEGORIES.includes(category);

                        let budgetOrForecast = 0;
                        let actualOrSpent = 0;
                        let varianceText = '';
                        let varianceColor = '';

                        if (isExpense) {
                            budgetOrForecast = data.budget || 0;
                            actualOrSpent = data.spent || 0;
                            const variance = data.variance || 0;
                            varianceColor = variance >= 0 ? 'var(--success-complement)' : 'var(--primary-orange)';
                            varianceText = `${variance >= 0 ? '+' : '-'}${formatCurrency(variance)} ${variance >= 0 ? 'Saved' : 'Over'}`;
                        } else if (isIncome) {
                            budgetOrForecast = data.forecast || 0;
                            actualOrSpent = data.actual || 0;
                            const variance = data.variance || 0;
                            varianceColor = variance >= 0 ? 'var(--success-complement)' : 'var(--primary-orange)';
                            varianceText = `${variance >= 0 ? '+' : '-'}${formatCurrency(variance)} ${variance >= 0 ? 'Above Forecast' : 'Below Forecast'}`;
                        } else {
                            return '';
                        }

                        const typeLabel = isIncome ? 'Forecast' : 'Budget';
                        const actualLabel = isIncome ? 'Actual' : 'Spent';


                        return `
                            <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; font-size:0.85rem; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.1);">
                                <span>${category} (${actualLabel}: ${formatCurrency(actualOrSpent)})</span>
                                <span style="font-weight: 600;">${typeLabel}: ${formatCurrency(budgetOrForecast)}</span>
                                <span style="color: ${varianceColor}; font-weight: 700;">${varianceText}</span>
                            </div>
                        `;
                    }).join('');


                return `
                    <div class="history-record ${isDeficit ? 'deficit' : ''}">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <h3 style="margin:0; font-size:1.2rem;"><i class="bi bi-calendar-event" style="font-size:1.2rem; padding-right: 8px;"></i>${record.cycleType.toUpperCase()} Cycle (${displayCycleStart})</h3>
                            <span style="font-weight:bold; font-size:1rem; color:${isDeficit ? 'var(--expense-color)' : 'var(--income-color)'};">
                                Net Flow: ${isDeficit ? '-' : ''}${formatCurrency(record.netFlow)}
                            </span>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:16px; font-size:0.9rem; margin-bottom:12px;">
                            <div>Total Budget: <strong style="color: var(--primary-orange);">${formatCurrency(record.startingBudget)}</strong></div>
                            <div>Total Income: <strong style="color: var(--income-color);">${formatCurrency(record.totalIncome)}</strong></div>
                            <div>Total Expenses: <strong style="color: var(--expense-color);">${formatCurrency(record.totalExpenses)}</strong></div>
                        </div>
                        <details>
                            <summary style="cursor:pointer; color:var(--primary-orange); font-size:0.9rem; font-weight:600;">View Budget & Actual Summary</summary>
                            <div style="margin-top:12px; background:rgba(0,0,0,0.2); padding:12px; border-radius:8px;">
                                ${categoryList}
                            </div>
                        </details>
                        <details style="margin-top: 10px;">
                             <summary style="cursor:pointer; color:var(--primary-orange); font-size:0.9rem; font-weight:600;">View ${record.transactions.length} Total Transactions</summary>
                             <div style="margin-top:12px; background:rgba(0,0,0,0.2); padding:8px; border-radius:8px;">
                                 ${record.transactions.map(t => `
                                     <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.1); font-size:0.85rem;">
                                         <span style="color: ${t.type === 'income' ? 'var(--income-color)' : 'var(--expense-color)'};">[${t.type.toUpperCase()}]</span>
                                         <span>${t.description} (${t.category})</span>
                                         <span>${formatCurrency(t.amount)}</span>
                                     </div>
                                 `).join('')}
                             </div>
                        </details>
                    </div>
                    `;
            }).join('')}
        </div>
    `;
};


// ----------------------------------------------------------------------
// --- APPLICATION RENDERING ---
// ----------------------------------------------------------------------

/**
 * Main render function to update the entire application UI structure.
 */
const renderApp = () => {
    const { totalIncome: inc, totalExpenses: exp, netFlow: flow, totalBudget: budget } = calculateTotals();
    const isNetFlowPositive = flow >= 0;
    const netFlowCardClasses = isNetFlowPositive ? 'net-flow-positive-item' : 'net-flow-negative-item';
    const totalBudgetVariance = budget - exp;
    const isOverBudget = totalBudgetVariance < 0;

    const cycleDisplay = getCycleDisplay();

    appContainer.innerHTML = `
        <h1 class="app-header">
            <span style="font-size: 2rem; margin-right: 8px; font-weight: bold;"></span>
            ${companyName} Expense Monitor (${cycleDisplay})
        </h1>
        
        <section id="summary-section" class="card">
            <div id="visualization-container">
                ${renderBudgetVisualization()}
            </div>
            <div id="summary-grid">
                <div class="summary-item budget-item">
                    <h2>TOTAL EXPENSE BUDGET</h2>
                    <p id="total-budget-display">
                        ${formatCurrency(budget)}
                    </p>
                </div>
                <div class="summary-item income-item-summary">
                    <h2>TOTAL INCOME ACTUALS</h2>
                    <p id="total-income-display">
                        ${formatCurrency(inc)}
                    </p>
                </div>
                <div class="summary-item expense-item-summary">
                    <h2>TOTAL EXPENSES ACTUALS</h2>
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
                <i class="bi bi-archive" style="margin-right: 8px;"></i> Cycle History (${monthlyRecords.length} Cycles)
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
        container.innerHTML = renderCurrentCycleManager();

        // Attach logic
        document.getElementById('set-cycle-start-btn').addEventListener('click', setCycleStart);
        
        // Render dynamic cards and listeners
        renderSettings(false); 
        renderCategoryBudgetSetter(false); 
        document.getElementById('add-transaction-form').addEventListener('submit', addTransaction);
        
        document.getElementById('transaction-date-input').value = new Date().toISOString().split('T')[0];

        document.getElementById('finalize-cycle-btn').addEventListener('click', finalizeCycle); 
        
        document.getElementById('category-breakdown-container').innerHTML = renderCategoryBreakdownChart(); 
        
        setupTransactionTypeListener(); 
        
        renderTransactionHistory();

    } else {
        container.innerHTML = renderMonthlyHistory();
    }
};

const setCycleStart = () => {
    const input = document.getElementById('cycle-start-input');
    const newDate = input.value;

    if (!newDate) return;

    if (newDate !== currentCycleStart) {
        currentCycleStart = newDate;
        renderApp();
    }
};

const renderCurrentCycleManager = () => {
    const today = new Date().toISOString().split('T')[0];
    const displayCycle = getCycleDisplay();

    const nextCycleStart = calculateNextCycleStart(currentCycleStart, cycleType);
    const nextCycleDisplay = new Date(nextCycleStart + 'T00:00:00').toLocaleDateString();

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
                            Log Transaction for Current Cycle
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
                        Transaction Log (Current Cycle)
                    </h2>
                    <div id="history-list-container" style="max-height: 400px; overflow-y: auto;">
                    </div>
                </section>
            </div>

            
            <div id="dashboard-actions-column">
                
                <section id="settings-card" class="card"></section>
                
                <section id="budget-setter-card" class="card"></section>

                <section class="card" id="date-setter-card">
                    <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 12px; color: var(--primary-orange);">
                        Active Cycle Start: ${new Date(currentCycleStart).toLocaleDateString()}
                    </h2>
                    <p style="font-size: 0.9rem; color: var(--light-text); margin-bottom: 12px;">
                       Period: ${displayCycle}
                    </p>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="date" id="cycle-start-input" value="${currentCycleStart}" style="flex-grow: 1;" required />
                        <button id="set-cycle-start-btn" class="btn btn-success" style="padding: 12px 16px; flex-shrink: 0;">
                            Set
                        </button>
                    </div>
                    <p style="margin-top: 10px; font-size: 0.85rem; color: var(--light-text); opacity: 0.6;">
                        All records are aggregated based on this start date.
                    </p>
                </section>

                <section class="card" id="finalize-card" style="background-color: var(--olive-tint);">
                    <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--primary-orange); margin-bottom: 16px;">
                        Archive Cycle
                    </h2>
                    <p style="font-size: 0.9rem; color: var(--light-text); margin-bottom: 12px;">
                        Finalize and archive the current cycle (${displayCycle}). Next cycle starts ${nextCycleDisplay}.
                    </p>
                    <button id="finalize-cycle-btn" class="btn btn-primary" style="width: 100%;">
                        Finalize & Start New Cycle
                    </button>
                    <div id="finalize-status" style="margin-top: 10px; text-align: center;"></div>
                </section>

            </div>
        </div>
    `;
};


// ----------------------------------------------------------------------
// --- INITIALIZATION ---
// ----------------------------------------------------------------------
loadData();
renderApp();