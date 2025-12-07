'use client';

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { Crepe } from '@milkdown/crepe';
import { replaceAll, insert } from '@milkdown/kit/utils';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
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
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const crepeRef = useRef<Crepe | null>(null);
    const isUpdatingRef = useRef(false);
    const [isReady, setIsReady] = useState(false);

    useImperativeHandle(ref, () => ({
        updateContent: (markdown: string) => {
            if (!crepeRef.current || !isReady) return;
            
            // Prevent feedback loop if we are updating from outside
            isUpdatingRef.current = true;
            
            try {
                // Use the replaceAll macro to replace all content
                crepeRef.current.editor.action(replaceAll(markdown));
            } catch (error) {
                console.error('Error updating content:', error);
            }
            
            // Reset the flag after a short delay to allow the update to propagate
            setTimeout(() => {
                isUpdatingRef.current = false;
            }, 50);
        },
        getMarkdown: () => {
            if (!crepeRef.current || !isReady) return '';
            try {
                return crepeRef.current.getMarkdown();
            } catch (error) {
                console.error('Error getting markdown:', error);
                return '';
            }
        },
        insertText: (text: string) => {
            if (!crepeRef.current || !isReady) return;
            try {
                // Use the insert macro to insert text at cursor position
                crepeRef.current.editor.action(insert(text, true));
            } catch (error) {
                console.error('Error inserting text:', error);
            }
        }
    }), [isReady]);

    useEffect(() => {
        if (!editorContainerRef.current) return;

        // Create Crepe editor instance
        const crepe = new Crepe({
            root: editorContainerRef.current,
            defaultValue: initialContent,
        });

        // Register event listeners for content changes
        crepe.on((listener) => {
            listener.markdownUpdated((ctx, markdown) => {
                // Only trigger onChange if this wasn't an external update
                if (!isUpdatingRef.current && onChange) {
                    onChange(markdown);
                }
            });
        });

        crepeRef.current = crepe;

        // Create the editor
        crepe.create().then(() => {
            setIsReady(true);
            console.log('Milkdown editor created');
        }).catch((error) => {
            console.error('Error creating Milkdown editor:', error);
        });

        return () => {
            crepe.destroy();
            crepeRef.current = null;
            setIsReady(false);
        };
    }, []); // Run once on mount

    return (
        <div className="milkdown-editor-wrapper border rounded-md p-4 min-h-[300px] bg-white text-black">
            <div ref={editorContainerRef} className="milkdown-container" />
        </div>
    );
});

Editor.displayName = 'Editor';

export default Editor;
