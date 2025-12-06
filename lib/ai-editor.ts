import * as Y from 'yjs';
import DiffMatchPatch from 'diff-match-patch';

// Initialize DMP instance
const dmp = new DiffMatchPatch();

export class AiEditorManager {
    mainDoc: Y.Doc;
    textFieldName: string;

    constructor(yDoc: Y.Doc, textFieldName = 'content') {
        this.mainDoc = yDoc;
        this.textFieldName = textFieldName;
    }

    /**
     * Coordinate the AI update cycle
     * @param aiStreamHandler - Function that calls LLM and returns the full response string
     * @param context - Additional context to pass to the AI (e.g. transcription)
     */
    async runAiCycle(aiStreamHandler: (text: string, context: string) => Promise<string>, context: string) {
        // 1. FORK: Create Shadow Doc
        const stateVector = Y.encodeStateAsUpdate(this.mainDoc);
        const shadowDoc = new Y.Doc();
        Y.applyUpdate(shadowDoc, stateVector);
        
        // Tag this client so we can identify AI changes later if needed
        Y.transact(shadowDoc, () => {}, 'ai-agent'); 

        const shadowText = shadowDoc.getText(this.textFieldName);
        const snapshotContent = shadowText.toString();

        // 2. GET AI RESPONSE
        // Pass the snapshot text to the AI
        console.log("AI Cycle: Sending request to AI...");
        const aiRawOutput = await aiStreamHandler(snapshotContent, context);
        console.log("AI Cycle: Received response:", aiRawOutput);

        // 3. APPLY CHANGES TO SHADOW DOC
        shadowDoc.transact(() => {
            this.applySearchReplaceBlocks(shadowText, aiRawOutput);
        }, 'ai-agent');

        // 4. SYNC BACK TO MAIN
        // Calculate the difference between Shadow (AI state) and Main (User state)
        const updateForMain = Y.encodeStateAsUpdate(shadowDoc, Y.encodeStateVector(this.mainDoc));
        Y.applyUpdate(this.mainDoc, updateForMain);
        console.log("AI Cycle: Synced changes back to main doc.");
    }

    /**
     * Parses AI output and applies edits using Fuzzy Matching
     */
    applySearchReplaceBlocks(yText: Y.Text, aiOutput: string) {
        const originalTextContent = yText.toString();
        let runningOffset = 0;
        let lastSearchIndex = 0;
        
        // Regex to extract SEARCH/REPLACE blocks
        const blockRegex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>>/g;
        
        let match;
        let matchCount = 0;
        while ((match = blockRegex.exec(aiOutput)) !== null) {
            matchCount++;
            const searchBlock = match[1];
            const replaceBlock = match[2];

            console.log(`[Block #${matchCount}] Found SEARCH/REPLACE block:`);
            console.log(`[Block #${matchCount}] SEARCH:\n${searchBlock}`);
            console.log(`[Block #${matchCount}] REPLACE:\n${replaceBlock}`);

            // A. FIND LOCATION IN ORIGINAL TEXT
            // 1. Try Exact Match first
            // Start searching from lastSearchIndex to ensure linear processing
            let loc = originalTextContent.indexOf(searchBlock, lastSearchIndex);
            console.log(`[Block #${matchCount}] Exact match location (original): ${loc}`);

            // 2. Fuzzy Match Fallback
            if (loc === -1) {
                console.warn(`[Block #${matchCount}] Exact match failed. Trying fuzzy match on prefix...`);
                const searchPrefix = searchBlock.substring(0, 32);
                // match_main takes a location hint. We give it lastSearchIndex.
                loc = dmp.match_main(originalTextContent, searchPrefix, lastSearchIndex);
                console.log(`[Block #${matchCount}] Fuzzy prefix match location (original): ${loc}`);
            }

            if (loc === -1) {
                console.warn(`[Block #${matchCount}] AI attempted to edit text that could not be found via fuzzy match. Skipping.`);
                continue;
            }

            // Update lastSearchIndex so next block searches after this one
            // We use the original length of the search block
            lastSearchIndex = loc + searchBlock.length;

            // B. CALCULATE DIFF
            const diffs = dmp.diff_main(searchBlock, replaceBlock);
            dmp.diff_cleanupSemantic(diffs);
            
            console.log(`[Block #${matchCount}] Calculated diffs:`, diffs);

            // C. APPLY TO YJS
            // Adjust location by runningOffset to account for previous edits
            let cursor = loc + runningOffset;
            
            diffs.forEach(([op, text]) => {
                switch (op) {
                    case 0: // DIFF_EQUAL
                        cursor += text.length;
                        break;
                    case -1: // DIFF_DELETE
                        console.log(`[Block #${matchCount}] Deleting at ${cursor}: "${text}"`);
                        yText.delete(cursor, text.length);
                        break;
                    case 1: // DIFF_INSERT
                        console.log(`[Block #${matchCount}] Inserting at ${cursor}: "${text}"`);
                        yText.insert(cursor, text);
                        cursor += text.length;
                        break;
                }
            });

            // Update runningOffset
            // The document grew/shrank by (replaceLen - searchLen)
            const netChange = replaceBlock.length - searchBlock.length;
            runningOffset += netChange;
            console.log(`[Block #${matchCount}] Net change: ${netChange}. New runningOffset: ${runningOffset}`);
        }
        if (matchCount === 0) {
            console.log("No SEARCH/REPLACE blocks found in AI output.");
        }
    }

    /**
     * Updates the Yjs document based on a full text replacement from the user (ProseMirror).
     * Uses DMP to calculate minimal edits.
     */
    updateFromUser(newText: string) {
        const yText = this.mainDoc.getText(this.textFieldName);
        const currentText = yText.toString();

        if (newText === currentText) return;

        const diffs = dmp.diff_main(currentText, newText);
        dmp.diff_cleanupSemantic(diffs);

        this.mainDoc.transact(() => {
            let cursor = 0;
            diffs.forEach(([op, text]) => {
                switch (op) {
                    case 0: // EQUAL
                        cursor += text.length;
                        break;
                    case -1: // DELETE
                        yText.delete(cursor, text.length);
                        break;
                    case 1: // INSERT
                        yText.insert(cursor, text);
                        cursor += text.length;
                        break;
                }
            });
        });
    }

    getMarkdown(): string {
        return this.mainDoc.getText(this.textFieldName).toString();
    }
}
