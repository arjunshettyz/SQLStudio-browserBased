const express = require('express');
const router = express.Router();
const Attempt = require('../models/Attempt');
const Assignment = require('../models/Assignment');
const { getClient } = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_prod';

// Middleware to check auth
const auth = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        res.status(400).json({ msg: 'Token is not valid' });
    }
};

// @route   POST /api/attempts
// @desc    Save a new attempt
// @access  Private
router.post('/', auth, async (req, res) => {
    const { assignmentId, code } = req.body;

    try {
        const assignment = await Assignment.findById(assignmentId).select('+solutionSQL');
        if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

        let status = 'Error';
        let validation = null;

        // Try to verify against solution using PostgreSQL
        if (assignment.solutionSQL) {
            let client = null;
            try {
                client = await getClient();
            } catch (connErr) {
                console.warn('Database unavailable for submission, using demo mode:', connErr.message);

                // DEMO MODE FALLBACK for submission
                status = 'Demo - Pending Review';
                validation = {
                    status: 'Demo Mode',
                    message: 'PostgreSQL not available. Complete submission saved for manual review.',
                    code: code,
                    demo: true
                };
            }

            if (client) {
                try {
                    await client.query('BEGIN');
                    
                    // Create tables first
                    if (assignment.schemaSQL) {
                        await client.query(assignment.schemaSQL);
                    }
                    
                    await client.query('SET statement_timeout = 2000');

                    const startTime = Date.now();
                    const userResult = await client.query(code);
                    const solResult = await client.query(assignment.solutionSQL);
                    const queryRuntime = Date.now() - startTime;

                    await client.query('ROLLBACK');

                    // Compare results
                    let passed = false;
                    if (solResult.rowCount !== undefined && userResult.rowCount !== undefined && solResult.rowCount === userResult.rowCount) {
                        const sortRows = (rows) => {
                            return rows.map(r => {
                                const ordered = {};
                                Object.keys(r).sort().forEach(key => ordered[key] = r[key]);
                                return ordered;
                            }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
                        };

                        const solRowsSorted = sortRows(solResult.rows);
                        const userRowsSorted = sortRows(userResult.rows);

                        passed = JSON.stringify(solRowsSorted) === JSON.stringify(userRowsSorted);
                    }

                    status = passed ? 'Success' : 'Incorrect';
                    validation = {
                        status: passed ? 'Accepted' : 'Wrong Answer',
                        runtime: queryRuntime,
                        userOutput: userResult.rows,
                        expectedOutput: solResult.rows,
                        comparison: passed
                    };

                    client.release();

                } catch (queryErr) {
                    try {
                        await client.query('ROLLBACK');
                    } catch (e) {}
                    client.release();

                    status = 'Error';
                    validation = {
                        status: 'Error',
                        error: queryErr.message
                    };
                }
            }
        } else {
            status = 'Success';
            validation = { status: 'Submitted' };
        }

        // Save attempt
        const attempt = await new Attempt({
            user: req.user.id,
            assignment: assignmentId,
            code,
            status
        }).save();

        res.json({
            attempt,
            validation
        });

    } catch (err) {
        console.error('Attempts endpoint error:', err);
        res.status(500).json({
            error: 'Submission failed',
            message: err.message
        });
    }
});

// @route   GET /api/attempts/all
// @desc    Get all attempts for the logged-in user
// @access  Private
router.get('/all', auth, async (req, res) => {
    try {
        const attempts = await Attempt.find({ user: req.user.id }).sort({ timestamp: -1 });
        res.json(attempts);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/attempts/:assignmentId
// @desc    Get user attempts for an assignment
// @access  Private
router.get('/:assignmentId', auth, async (req, res) => {
    try {
        const attempts = await Attempt.find({
            user: req.user.id,
            assignment: req.params.assignmentId
        }).sort({ timestamp: -1 });

        res.json(attempts);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
