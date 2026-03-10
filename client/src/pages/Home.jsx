import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

const Home = () => {
    const { user } = useAuth();
    const [assignments, setAssignments] = useState([]);
    const [attemptsMap, setAttemptsMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [searchParams] = useSearchParams();
    const searchQuery = searchParams.get('q') || '';

    useEffect(() => {
        axios.get('/api/assignments')
            .then(res => {
                // Enrich with mock data for UI demo
                const enriched = res.data.map(a => ({
                    ...a,
                    acceptance: (Math.random() * (80 - 30) + 30).toFixed(1)
                }));

                // Sort by difficulty: Easy -> Medium -> Hard
                const difficultyOrder = { 'Easy': 1, 'Medium': 2, 'Hard': 3 };
                enriched.sort((a, b) => (difficultyOrder[a.difficulty] || 99) - (difficultyOrder[b.difficulty] || 99));

                setAssignments(enriched);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (user) {
            axios.get('/api/attempts/all')
                .then(res => {
                    const map = {};
                    res.data.forEach(attempt => {
                        const aid = typeof attempt.assignment === 'object' ? attempt.assignment._id : attempt.assignment;
                        if (!map[aid]) map[aid] = [];
                        map[aid].push(attempt);
                    });
                    setAttemptsMap(map);
                })
                .catch(console.error);
        } else {
            setAttemptsMap({});
        }
    }, [user]);

    const getDifficultyColor = (diff) => {
        switch (diff) {
            case 'Hard': return '#ef4444'; // Red
            case 'Medium': return '#eab308'; // Yellow/Orange
            case 'Easy': return '#00b8a3'; // Cyan/Green
            default: return '#fff';
        }
    };

    const getAssignmentStatus = (assignmentId) => {
        const attempts = attemptsMap[assignmentId];
        if (attempts && attempts.length > 0) {
            if (attempts.some(a => a.status === 'Success')) {
                return { text: 'Accepted', color: '#00b8a3' }; // Green
            } else {
                return { text: 'Wrong', color: '#ef4444' }; // Red
            }
        }
        
        // Check local storage for pending
        const storageKey = `cipher_autosave_${user?._id || user?.id || 'guest'}_${assignmentId}`;
        const savedCode = localStorage.getItem(storageKey);
        
        // Only count as pending if they've written code that isn't just the default comment
        if (savedCode && savedCode.trim() !== '' && savedCode.trim() !== '-- Write query here' && !savedCode.trim().startsWith('CREATE')) {
            return { text: 'Pending', color: '#f97316' }; // Orange
        }

        return null; // No status
    };

    const filteredAssignments = assignments.filter(a =>
        a.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <Navbar />

            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem', width: '100%' }}>

                {/* Header / Stats */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                    </div>
                </div>

                {/* List Container */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* List Header */}
                    <div className="stack-on-mobile" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 120px 120px 100px', padding: '0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', gap: '1rem' }}>
                        <div>Title</div>
                        <div className="hide-on-mobile" style={{ textAlign: 'center' }}>Acceptance</div>
                        <div className="hide-on-mobile" style={{ textAlign: 'center' }}>Difficulty</div>
                        <div style={{ textAlign: 'right' }}>Status</div>
                    </div>

                    {/* Loading State */}
                    {loading && <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading questions...</div>}

                    {/* Questions List */}
                    {!loading && filteredAssignments.map((ass, index) => (
                        <div
                            className="stack-on-mobile"
                            key={ass._id}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(200px, 1fr) 120px 120px 100px',
                                gap: '1rem',
                                padding: '1.25rem 1.5rem',
                                alignItems: 'center',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                                transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                                e.currentTarget.style.borderColor = 'var(--border-color)';
                            }}
                        >
                            {/* Title */}
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <Link
                                    to={`/workspace/${ass._id}`}
                                    style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: '600', fontSize: '1.05rem', transition: 'color 0.2s' }}
                                    onMouseOver={(e) => e.target.style.color = 'var(--accent-primary)'}
                                    onMouseOut={(e) => e.target.style.color = 'var(--text-primary)'}
                                >
                                    {index + 1}. {ass.title}
                                </Link>
                            </div>

                            {/* Acceptance */}
                            <div className="hide-on-mobile" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>
                                {ass.acceptance}%
                            </div>

                            {/* Difficulty */}
                            <div className="hide-on-mobile" style={{ color: getDifficultyColor(ass.difficulty), fontWeight: '500', fontSize: '0.9rem', textAlign: 'center' }}>
                                {ass.difficulty === 'Medium' ? 'Med.' : ass.difficulty}
                            </div>

                            {/* Status */}
                            <div style={{ fontSize: '0.9rem', fontWeight: '500', textAlign: 'right' }}>
                                {getAssignmentStatus(ass._id) ? (
                                    <span style={{ color: getAssignmentStatus(ass._id).color }}>
                                        {getAssignmentStatus(ass._id).text}
                                    </span>
                                ) : (
                                    <span style={{ color: '#555' }}>-</span>
                                )}
                            </div>
                        </div>
                    ))}

                </div>
            </div>
        </div>
    );
};

export default Home;
