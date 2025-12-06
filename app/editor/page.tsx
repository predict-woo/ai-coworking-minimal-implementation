'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Editor, { EditorRef } from '@/components/Editor';
import { AiEditorManager } from '@/lib/ai-editor';
import { TRANSCRIPTION_BLOCKS } from '@/lib/transcription-data';
import * as Y from 'yjs';

const TEMPLATE = `# Meeting Notes
Date: ${new Date().toLocaleDateString()}
Attendees: 

## Agenda
1. 
2. 

## Discussion Points
- 

## Action Items
- [ ] 
`;

export default function EditorPage() {
    const editorRef = useRef<EditorRef>(null);
    const [isSimulating, setIsSimulating] = useState(false);
    const [transcriptionIndex, setTranscriptionIndex] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    
    // Yjs & AI Manager - Use useState for lazy initialization to avoid re-creating on every render
    const [yDoc] = useState(() => new Y.Doc());
    const [aiManager] = useState(() => new AiEditorManager(yDoc));

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const handleInsertTemplate = () => {
        editorRef.current?.updateContent(TEMPLATE);
        aiManager.updateFromUser(TEMPLATE);
        addLog("Inserted template");
    };

    const handleEditorChange = useCallback((markdown: string) => {
        // Sync user changes to Yjs
        aiManager.updateFromUser(markdown);
    }, [aiManager]);

    const startSimulation = () => {
        setIsSimulating(true);
        addLog("Simulation started");
    };

    const stopSimulation = () => {
        setIsSimulating(false);
        addLog("Simulation stopped");
    };

    // Simulation Loop
    useEffect(() => {
        if (!isSimulating) return;

        const interval = setInterval(async () => {
            if (transcriptionIndex >= TRANSCRIPTION_BLOCKS.length) {
                setIsSimulating(false);
                addLog("Simulation finished (no more blocks)");
                return;
            }

            const block = TRANSCRIPTION_BLOCKS[transcriptionIndex];
            addLog(`Processing block ${transcriptionIndex + 1}: "${block.substring(0, 30)}..."`);

            try {
                await aiManager.runAiCycle(async (text, context) => {
                    const response = await fetch('/api/chat', {
                        method: 'POST',
                        body: JSON.stringify({
                            messages: [
                                { role: 'system', content: `You are a helpful meeting assistant. You are listening to a meeting transcription and updating the meeting notes.
                                
When editing text, do not output the full file. Output a SEARCH block containing the original text you want to modify, and a REPLACE block containing the new text. Use this format:

<<<<<<< SEARCH
- Discuss Q4 Marketing Strategy
  - Focus on social media
======= REPLACE
- Discuss Q4 Marketing Strategy
  - Focus on social media
  - Hire new content creator
>>>>>>>

If you want to add something new, SEARCH for the nearest context (e.g. a header or previous bullet point) and REPLACE it with the context + the new content.
If you don't need to make any changes, just reply with "NO_CHANGES".

Current Meeting Notes:
${text}
` },
                                { role: 'user', content: `New Transcription Block:
${context}

Based on this new information, please update the meeting notes. Focus on capturing key decisions, action items, and important discussion points. Use the SEARCH/REPLACE format.` }
                            ]
                        })
                    });
                    
                    const textContent = await response.text();
                    console.log("Raw AI Response from API:", textContent);
                    return textContent;
                }, block);

                // Sync back to Editor UI
                const newMarkdown = aiManager.getMarkdown();
                editorRef.current?.updateContent(newMarkdown);
                addLog("AI update applied");

            } catch (error) {
                console.error(error);
                addLog(`Error: ${error}`);
            }

            setTranscriptionIndex(prev => prev + 1);

        }, 10000); // Run every 10s for testing (instead of 30s)

        return () => clearInterval(interval);
    }, [isSimulating, transcriptionIndex, aiManager]);

    return (
        <div className="container mx-auto p-8">
            <h1 className="text-3xl font-bold mb-6">AI Collaborative Editor Prototype</h1>
            
            <div className="flex gap-4 mb-6">
                <button 
                    onClick={handleInsertTemplate}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                    Insert Template
                </button>
                {!isSimulating ? (
                    <button 
                        onClick={startSimulation}
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                    >
                        Start Experience
                    </button>
                ) : (
                    <button 
                        onClick={stopSimulation}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        Stop Simulation
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <Editor 
                        ref={editorRef} 
                        onChange={handleEditorChange}
                    />
                </div>
                
                <div className="bg-gray-100 p-4 rounded h-[600px] overflow-y-auto font-mono text-sm">
                    <h2 className="font-bold mb-2">System Logs</h2>
                    {logs.map((log, i) => (
                        <div key={i} className="mb-1 border-b border-gray-200 pb-1">{log}</div>
                    ))}
                </div>
            </div>
        </div>
    );
}
