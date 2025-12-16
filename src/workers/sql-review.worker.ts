
import { pipeline, env } from '@xenova/transformers';

// Configuration
// Force loading from local public/models directory
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models';

// State
let reviewer: any = null;
let isReviewing = false;

// System Prompt for Qwen2.5-Coder to act as an Indonesian Senior SQL Developer
const SYSTEM_PROMPT = `
Anda adalah Senior Database Administrator & SQL Expert yang teliti.
Tugas anda adalah melakukan Code Review terhadap Stored Procedure yang diberikan.
Berikan analisa mendalam mengenai:
1. Potensi Bug (Logic Error).
2. Potensi Masalah Performa (Performance Issue).
3. Masalah Keamanan (Security Vulnerability).

Panduan Output:
- Jawablah menggunakan Bahasa Indonesia yang formal dan jelas.
- Gunakan poin-poin (bullet points).
- Jika kode sudah bagus, katakan sudah optimal.
- Jangan menulis ulang seluruh kode, cukup highlight bagian yang bermasalah.
`;

self.addEventListener('message', async (event: MessageEvent) => {
    const { type, payload } = event.data;

    try {
        switch (type) {
            case 'init':
                if (reviewer) {
                    self.postMessage({ type: 'ready' });
                    return;
                }

                // Initialize Pipeline
                // Use strict loading to avoid 404s
                reviewer = await pipeline('text-generation', 'qwen25coder', {
                    // Add specific device option if needed
                    // device: 'webgpu', // Uncomment if you want to try WebGPU (require browser support)
                    quantized: true, // Use the quantized model (model_quantized.onnx)
                    progress_callback: (data: any) => {
                        // Forward download/loading progress to main thread
                        if (data.status === 'progress') {
                            self.postMessage({
                                type: 'progress',
                                payload: {
                                    percent: data.progress, // 0 - 100
                                    file: data.file
                                }
                            });
                        }
                        if (data.status === 'initiate') {
                            self.postMessage({ type: 'status', payload: 'Preparing Your AI...' });
                        }
                        if (data.status === 'ready') {
                            self.postMessage({ type: 'status', payload: 'Model Loaded into Memory' });
                        }
                    }
                });

                self.postMessage({ type: 'ready' });
                break;

            case 'review':
                if (!reviewer) {
                    throw new Error("AI Model belum siap. Tunggu loading selesai.");
                }

                if (isReviewing) return;
                isReviewing = true;

                const { sqlCode } = payload;

                // Construct Prompt (Chat Format for Instruct Model)
                const messages = [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Review SQL Code ini:\n\n\`\`\`sql\n${sqlCode}\n\`\`\`` }
                ];

                // Construct prompt string manually or use apply_chat_template if available (simplifying here for manual control)
                // Qwen Chat Template is usually: <|im_start|>system\n...<|im_end|>\n<|im_start|>user\n...<|im_end|>\n<|im_start|>assistant\n

                const fullPrompt = `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\nReview SQL Code ini:\n\n\`\`\`sql\n${sqlCode}\n\`\`\`<|im_end|>\n<|im_start|>assistant\n`;

                self.postMessage({ type: 'status', payload: 'Sedang Menganalisa...' });

                const output = await reviewer(fullPrompt, {
                    max_new_tokens: 1024,
                    temperature: 0.2, // Low temp for more factual analysis
                    do_sample: true,
                    top_k: 50,
                });

                // Extract generated text
                let generatedText = output[0].generated_text;

                // Clean up prompt from result if included
                if (generatedText.includes('<|im_start|>assistant\n')) {
                    generatedText = generatedText.split('<|im_start|>assistant\n')[1];
                }
                // Remove trailing tags
                generatedText = generatedText.replace('<|im_end|>', '');

                self.postMessage({ type: 'result', payload: generatedText });
                isReviewing = false;
                break;
        }
    } catch (error: any) {
        console.error('[Worker Error]', error);
        self.postMessage({ type: 'error', payload: error.message || 'Unknown error' });
        isReviewing = false;
    }
});
