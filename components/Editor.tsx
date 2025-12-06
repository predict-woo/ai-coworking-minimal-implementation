'use client';

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema, defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { exampleSetup } from 'prosemirror-example-setup';
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-menu/style/menu.css';
import 'prosemirror-example-setup/style/style.css';
import './editor.css';

interface EditorProps {
    initialContent?: string;
    onChange?: (markdown: string) => void;
}

export interface EditorRef {
    updateContent: (markdown: string) => void;
    getMarkdown: () => string;
    insertText: (text: string) => void;
}

const Editor = forwardRef<EditorRef, EditorProps>(({ initialContent = '', onChange }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const isUpdatingRef = useRef(false);

    useImperativeHandle(ref, () => ({
        updateContent: (markdown: string) => {
            if (!viewRef.current) return;
            
            // Prevent feedback loop if we are updating from outside
            isUpdatingRef.current = true;
            
            const view = viewRef.current;
            const state = view.state;
            const newDoc = defaultMarkdownParser.parse(markdown);
            
            // Check if we have focus before update
            const hasFocus = view.hasFocus();
            
            // Create a transaction to replace content
            // We replace the entire document content with the new parsed content
            const tr = state.tr.replaceWith(0, state.doc.content.size, newDoc);
            
            // Don't add to history for external updates to avoid polluting undo stack
            tr.setMeta('addToHistory', false);
            
            view.dispatch(tr);
            
            // Restore focus if we had it
            if (hasFocus) {
                view.focus();
            }
            
            isUpdatingRef.current = false;
        },
        getMarkdown: () => {
            if (!viewRef.current) return '';
            return defaultMarkdownSerializer.serialize(viewRef.current.state.doc);
        },
        insertText: (text: string) => {
            if (!viewRef.current) return;
            const { state, dispatch } = viewRef.current;
            const tr = state.tr.insertText(text);
            dispatch(tr);
        }
    }));

    useEffect(() => {
        if (!editorRef.current) return;

        const state = EditorState.create({
            doc: defaultMarkdownParser.parse(initialContent),
            plugins: exampleSetup({ schema })
        });

        const view = new EditorView(editorRef.current, {
            state,
            dispatchTransaction(transaction) {
                const newState = view.state.apply(transaction);
                view.updateState(newState);
                
                if (transaction.docChanged && !isUpdatingRef.current && onChange) {
                    const markdown = defaultMarkdownSerializer.serialize(newState.doc);
                    onChange(markdown);
                }
            }
        });

        viewRef.current = view;

        return () => {
            view.destroy();
        };
    }, []); // Run once on mount

    return (
        <div className="prosemirror-editor-wrapper border rounded-md p-4 min-h-[300px] bg-white text-black">
            <style jsx global>{`
                .ProseMirror {
                    outline: none;
                    line-height: 1.5;
                }
                .ProseMirror h1 {
                    font-size: 2em;
                    font-weight: bold;
                    margin-top: 0.67em;
                    margin-bottom: 0.67em;
                }
                .ProseMirror h2 {
                    font-size: 1.5em;
                    font-weight: bold;
                    margin-top: 0.83em;
                    margin-bottom: 0.83em;
                }
                .ProseMirror h3 {
                    font-size: 1.17em;
                    font-weight: bold;
                    margin-top: 1em;
                    margin-bottom: 1em;
                }
                .ProseMirror ul {
                    list-style-type: disc;
                    padding-left: 40px;
                    margin-top: 1em;
                    margin-bottom: 1em;
                }
                .ProseMirror ol {
                    list-style-type: decimal;
                    padding-left: 40px;
                    margin-top: 1em;
                    margin-bottom: 1em;
                }
                .ProseMirror li {
                    display: list-item;
                }
                .ProseMirror blockquote {
                    border-left: 4px solid #ccc;
                    margin-left: 0;
                    padding-left: 1em;
                    color: #666;
                }
                .ProseMirror pre {
                    background-color: #f5f5f5;
                    padding: 1em;
                    border-radius: 4px;
                    font-family: monospace;
                }
                .ProseMirror code {
                    background-color: #f5f5f5;
                    padding: 0.2em 0.4em;
                    border-radius: 3px;
                    font-family: monospace;
                }
            `}</style>
            <div ref={editorRef} />
        </div>
    );
});

Editor.displayName = 'Editor';

export default Editor;
