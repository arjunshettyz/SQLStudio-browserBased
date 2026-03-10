const express = require('express');
const router = express.Router();
const { getClient } = require('../db');
const Assignment = require('../models/Assignment');

// Mock data for demo mode
const mockData = {
    'High Earners': [
        { name: 'Alice', salary: 90000 },
        { name: 'Charlie', salary: 120000 }
    ],
    'Department Headcounts': [
        { department: 'Engineering', count: 3 },
        { department: 'HR', count: 2 },
        { department: 'Marketing', count: 1 }
    ]
};

router.post('/', async (req, res) => {
    const { code, assignmentId } = req.body;

    if (!code || !assignmentId) {
        return res.status(400).json({ error: 'Missing code or assignmentId' });
    }

    try {
        // Fetch the assignment
        const assignment = await Assignment.findById(assignmentId).select('+solutionSQL');
        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        // Try to execute on real database
        let client;
        try {
            client = await getClient();
        } catch (connErr) {
            console.warn('Database unavailable, using demo mode:', connErr.message);
            
            // DEMO MODE FALLBACK
            const demoRows = mockData[assignment.title] || [{ message: 'Demo: PostgreSQL not available' }];
            const demoFields = demoRows.length > 0 ? Object.keys(demoRows[0]) : ['message'];
            
            let validation = null;
            if (assignment.solutionSQL) {
                const isValidQuery = /^\s*select/i.test(code.trim());
                validation = {
                    status: 'Demo Mode',
                    runtime: 0,
                    userOutput: demoRows,
                    expectedOutput: demoRows,
                    comparison: isValidQuery
                };
            }

            return res.json({
                rows: demoRows,
                rowCount: demoRows.length,
                fields: demoFields,
                command: 'SELECT',
                validation,
                demo: true,
                message: 'Running in DEMO MODE - PostgreSQL not available'
            });
        }

        try {
            // 1. Transaction Start
            await client.query('BEGIN');

            // 2. Create tables from assignment schema
            if (assignment.schemaSQL) {
                await client.query(assignment.schemaSQL);
            }

            // 3. Set timeout
            await client.query('SET statement_timeout = 2000');

            // 4. Execute user code
            const startTime = Date.now();
            const executionResult = await client.query(code);
            const queryRuntime = Date.now() - startTime;

            // 5. Verify
            let validation = null;
            if (assignment && assignment.solutionSQL) {
                const correctAnswer = await client.query(assignment.solutionSQL);
                const passed = verifyResults(executionResult, correctAnswer);
                validation = {
                    status: passed ? 'Accepted' : 'Wrong Answer',
                    runtime: queryRuntime,
                    userOutput: executionResult.rows,
                    expectedOutput: correctAnswer.rows,
                    comparison: passed
                };
            }

            // 6. Cleanup
            await client.query('ROLLBACK');
            client.release();

            return res.json({
                rows: executionResult.rows,
                rowCount: executionResult.rowCount,
                fields: executionResult.fields.map(f => f.name),
                command: executionResult.command,
                validation
            });

        } catch (queryErr) {
            try {
                await client.query('ROLLBACK');
            } catch (e) {}
            client.release();

            return res.status(400).json({
                error: queryErr.message,
                validation: {
                    status: 'Error',
                    error: queryErr.message
                }
            });
        }

    } catch (err) {
        console.error('Execute error:', err);
        res.status(500).json({
            error: err.message,
            hint: 'Ensure PostgreSQL is running'
        });
    }
});

/**
 * Compares the user's result against the correct answer.
 * Optimization: Canonicalizes and stringifies rows *before* sorting to avoid 
 * repeated JSON.stringify calls during the O(N log N) sort.
 */
function verifyResults(userResult, solResult) {
    if (userResult.rowCount !== solResult.rowCount) {
        return false;
    }

    // Helper to turn a row object into a deterministic string key
    // e.g. { b: 1, a: 2 } -> '{"a":2,"b":1}'
    const canonicalize = (row) => {
        const sortedKeys = Object.keys(row).sort();
        const obj = {};
        for (const key of sortedKeys) {
            obj[key] = row[key];
        }
        return JSON.stringify(obj);
    };

    // Pre-calculate strings for O(N) prep cost
    const userRows = userResult.rows.map(canonicalize);
    const solRows = solResult.rows.map(canonicalize);

    // Sort strings: O(N log N)
    userRows.sort();
    solRows.sort();

    // Linear compare: O(N)
    for (let i = 0; i < userRows.length; i++) {
        if (userRows[i] !== solRows[i]) {
            return false;
        }
    }

    return true;
}

// Admin endpoint to seed the schema for an assignment
router.post('/seed/:id', async (req, res) => {
    const { id } = req.params;
    const client = await getClient();
    try {
        const assignment = await Assignment.findById(id);
        if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

        const schemaName = `assignment_${id}`;
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
        await client.query(`SET search_path TO "${schemaName}"`);
        await client.query(assignment.schemaSQL); // Run the table creation/seeding SQL

        res.json({ message: `Schema ${schemaName} seeded successfully` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
