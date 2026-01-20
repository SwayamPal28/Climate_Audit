import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './LLMAnalystPanel.css';

/**
 * Reusable AI Analysis Panel Component
 * 
 * Provides LLM-powered analysis for climate policy simulations
 * with conversational follow-up capabilities.
 */
const LLMAnalystPanel = ({
    analysisType,      // "policy" | "shapley" | "diplomatic" | "bilateral" | "anomaly"
    simulationData,    // The raw data to analyze (object)
    autoTrigger = false,       // Boolean: auto-analyze on mount?
    collapsed = false,         // Boolean: start collapsed?
    onAnalysisComplete = null  // Optional callback when analysis finishes
}) => {
    // State management
    const [analysis, setAnalysis] = useState(null);  // LLM response
    const [isAnalyzing, setIsAnalyzing] = useState(false);  // Loading state
    const [conversation, setConversation] = useState([]);  // Chat history
    const [userQuestion, setUserQuestion] = useState('');  // Input field value
    const [error, setError] = useState(null);  // Error handling
    const [isCollapsed, setIsCollapsed] = useState(collapsed);  // Panel visibility

    // Auto-trigger analysis when data changes
    useEffect(() => {
        if (autoTrigger && simulationData && !analysis) {
            triggerAnalysis();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [simulationData, autoTrigger]);

    // Map analysis type to API endpoint
    const getEndpointForType = (type) => {
        const endpoints = {
            'policy': 'http://localhost:8000/api/llm/analyze-policy',
            'shapley': 'http://localhost:8000/api/llm/analyze-shapley',
            'diplomatic': 'http://localhost:8000/api/llm/analyze-diplomatic',
            'bilateral': 'http://localhost:8000/api/llm/analyze-bilateral',
            'anomaly': 'http://localhost:8000/api/llm/analyze-anomalies'
        };
        return endpoints[type];
    };

    // Trigger analysis
    const triggerAnalysis = async () => {
        setIsAnalyzing(true);
        setError(null);

        try {
            const endpoint = getEndpointForType(analysisType);
            const response = await axios.post(endpoint, simulationData);

            // Store analysis
            setAnalysis(response.data.analysis);

            // Initialize conversation with analysis
            const formattedAnalysis = formatAnalysisForDisplay(response.data.analysis);
            setConversation([
                { role: 'assistant', content: formattedAnalysis }
            ]);

            // Callback if provided
            if (onAnalysisComplete) {
                onAnalysisComplete(response.data.analysis);
            }
        } catch (err) {
            let errorMsg = err.message || "Analysis failed";
            if (err.response?.data?.detail) {
                const detail = err.response.data.detail;
                errorMsg = typeof detail === 'object' ? JSON.stringify(detail) : detail;
            }
            setError(errorMsg);
            console.error('LLM Analysis Error:', err);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Format analysis for display
    const formatAnalysisForDisplay = (analysisData) => {
        if (typeof analysisData === 'string') {
            return analysisData;
        }

        // For structured responses, format nicely
        let formatted = '';

        if (analysisData.executive_summary) {
            formatted += `**Executive Summary**\n${analysisData.executive_summary}\n\n`;
        }
        if (analysisData.key_findings) {
            formatted += `**Key Findings**\n${analysisData.key_findings}\n\n`;
        }
        if (analysisData.tradeoffs) {
            formatted += `**Tradeoffs**\n${analysisData.tradeoffs}\n\n`;
        }
        if (analysisData.recommendation) {
            formatted += `**Recommendation**\n${analysisData.recommendation}\n\n`;
        }
        if (analysisData.explanation) {
            formatted += analysisData.explanation;
        }
        if (analysisData.strategic_analysis) {
            formatted += `**Strategic Analysis**\n${analysisData.strategic_analysis}\n\n`;
        }
        if (analysisData.why_retaliated) {
            formatted += `**Why Retaliated**\n${analysisData.why_retaliated}\n\n`;
        }
        if (analysisData.next_move_advice) {
            formatted += `**Next Move**\n${analysisData.next_move_advice}\n\n`;
        }
        if (analysisData.full_text) {
            formatted = analysisData.full_text;
        }

        return formatted || JSON.stringify(analysisData, null, 2);
    };

    // Handle follow-up questions
    const askFollowUp = async () => {
        if (!userQuestion.trim()) return;

        // Add user question to conversation
        const newConversation = [
            ...conversation,
            { role: 'user', content: userQuestion }
        ];
        setConversation(newConversation);
        setUserQuestion('');  // Clear input
        setIsAnalyzing(true);

        try {
            const response = await axios.post('http://localhost:8000/api/llm/chat', {
                conversation_history: newConversation,
                user_question: userQuestion,
                context_data: simulationData
            });

            // Add AI response to conversation
            setConversation([
                ...newConversation,
                { role: 'assistant', content: response.data.response }
            ]);
        } catch (err) {
            let errorMsg = err.message || "Chat failed";
            if (err.response?.data?.detail) {
                const detail = err.response.data.detail;
                errorMsg = typeof detail === 'object' ? JSON.stringify(detail) : detail;
            }
            setError(errorMsg);
            console.error('Chat Error:', err);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Handle Enter key in input
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            askFollowUp();
        }
    };

    return (
        <div className={`llm-panel ${isCollapsed ? 'collapsed' : 'expanded'}`}>
            {/* Header with collapse button */}
            <div className="llm-panel-header">
                <h3>AI Policy Analyst</h3>
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="collapse-btn"
                >
                    {isCollapsed ? '▼' : '▲'}
                </button>
            </div>

            {/* Main content (hidden when collapsed) */}
            {!isCollapsed && (
                <div className="llm-panel-content">
                    {/* Loading state */}
                    {isAnalyzing && (
                        <div className="llm-loading">
                            <div className="spinner"></div>
                            <p>Analyzing results...</p>
                        </div>
                    )}

                    {/* Error state */}
                    {error && !isAnalyzing && (
                        <div className="llm-error">
                            <p>Error: {error}</p>
                            <button onClick={triggerAnalysis} className="retry-btn">
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Analysis display */}
                    {analysis && !isAnalyzing && (
                        <div className="llm-analysis">
                            {/* Render conversation history */}
                            {conversation.map((msg, idx) => (
                                <div key={idx} className={`message ${msg.role}`}>
                                    <div className="message-content">
                                        {msg.content.split('\n').map((line, i) => {
                                            // Handle markdown-style bold
                                            if (line.startsWith('**') && line.endsWith('**')) {
                                                return <h4 key={i}>{line.replace(/\*\*/g, '')}</h4>;
                                            }
                                            return line ? <p key={i}>{line}</p> : <br key={i} />;
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Chat input (only show if analysis exists) */}
                    {analysis && (
                        <div className="llm-chat-input">
                            <input
                                type="text"
                                value={userQuestion}
                                onChange={(e) => setUserQuestion(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Ask a follow-up question..."
                                disabled={isAnalyzing}
                            />
                            <button
                                onClick={askFollowUp}
                                disabled={isAnalyzing || !userQuestion.trim()}
                                className="send-btn"
                            >
                                Send →
                            </button>
                        </div>
                    )}

                    {/* Placeholder when no analysis yet */}
                    {!analysis && !isAnalyzing && !error && (
                        <div className="llm-placeholder">
                            <p>Click "Analyze" to get AI insights</p>
                            <button onClick={triggerAnalysis} className="analyze-btn">
                                Analyze Results
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LLMAnalystPanel;
