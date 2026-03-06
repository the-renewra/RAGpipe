import React, { useState } from "react";
import { RecorderProvider, useRecorder } from "./components/RecorderProvider";
import { FileText, Database, Settings, FileOutput, Play, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { vectorStore, DocumentChunk } from "./lib/rag";
import { generateContent } from "./lib/gemini";
import Markdown from "react-markdown";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as pdfjsLib from "pdfjs-dist";

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// The SOP from the prompt
const DEFAULT_SOP = [
  "SOP: Quantitative Prompt Assessment & Credit Optimization",
  "1. Executive Summary",
  "To move from \"vibe-based\" prompting to Engineering-Grade Assessment, prompts must be evaluated as code assets. The goal is to maximize the Return on Intelligence (ROI) by balancing output quality against token consumption (credits).",
  "2. The Weighted Scoring Matrix",
  "Use this 100-point scale to audit any prompt before moving it to a production environment.",
  "- Instruction Adherence (40%): Did the LLM follow negative constraints and formatting (JSON/Markdown)?",
  "- Token Efficiency (30%): The ratio of Useful Output Tokens vs. Total Input/Context Tokens.",
  "- Semantic Accuracy (20%): How close is the output vector to the \"Golden Response\" (Ground Truth)?",
  "- Latency & Robustness (10%): Speed of generation and consistency across different seeds/temperatures.",
  "3. Mathematical Validation: The CAQ Formula",
  "CAQ = (Success Rate * Semantic Accuracy) / Total Token Cost",
  "Goal: A higher CAQ coefficient indicates a more \"surgical\" prompt.",
  "4. The Surgical Process",
  "- Baseline: Run your \"Draft Prompt\" 10 times. Record the average cost and success rate.",
  "- Pruning: Remove \"Politeness\" (e.g., \"Please,\" \"Thank you\") and redundant context.",
  "- Variable Injection: Use placeholders {{input}} to separate instructions from data, reducing \"Instruction Drift.\"",
  "- CoT Audit: If using \"Chain of Thought\" (Think step-by-step), verify if the logic gain justifies the 2x–5x increase in output tokens."
].join("\n");

function AppContent() {
  const [activeTab, setActiveTab] = useState<"context" | "prompt" | "evaluate" | "report">("context");
  
  // Context State
  const [documents, setDocuments] = useState<{ name: string; chunks: number; chunkIds: string[]; size: number; wordCount: number; uploadTimestamp: number }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  // Prompt State
  const [draftPrompt, setDraftPrompt] = useState("");
  const [refinedPrompt, setRefinedPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  
  // Evaluation State
  const [evaluationResult, setEvaluationResult] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [customCriteria, setCustomCriteria] = useState("");
  const [retrievedChunks, setRetrievedChunks] = useState<DocumentChunk[]>([]);
  const [rawResponse, setRawResponse] = useState<string | null>(null);

  // Recorder
  const { events } = useRecorder();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsProcessing(true);
    setUploadProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let text = "";
        
        if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          let fullText = "";
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(" ");
            fullText += pageText + "\n\n";
          }
          text = fullText;
        } else {
          text = await file.text();
        }

        const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
        const uploadTimestamp = Date.now();
        const size = file.size;

        const chunksAdded = await vectorStore.addDocument(text, { filename: file.name, size, wordCount, uploadTimestamp }, (progress) => {
          const baseProgress = (i / files.length) * 100;
          const fileProgress = (progress / 100) * (100 / files.length);
          setUploadProgress(Math.round(baseProgress + fileProgress));
        });
        setDocuments((prev) => [...prev, { name: file.name, chunks: chunksAdded.length, chunkIds: chunksAdded, size, wordCount, uploadTimestamp }]);
      }
    } catch (error) {
      console.error("Error processing file:", error);
      alert(error instanceof Error ? error.message : "Error processing file. Please ensure it is a text-based or PDF file.");
    } finally {
      setIsProcessing(false);
      setUploadProgress(null);
    }
  };

  const handleRefinePrompt = async () => {
    setIsRefining(true);
    try {
      const systemInstruction = "You are an expert prompt engineer. Refine the user's draft prompt to be surgical, removing politeness, separating instructions from data, and making it highly token-efficient.";
      const refined = await generateContent("Draft Prompt:\n" + draftPrompt + "\n\nPlease refine this prompt according to best practices.", systemInstruction);
      setRefinedPrompt(refined);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Error refining prompt. Please try again.");
    } finally {
      setIsRefining(false);
    }
  };

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    try {
      // 1. Retrieve relevant context
      const relevantChunks = await vectorStore.search(refinedPrompt || draftPrompt, 3);
      setRetrievedChunks(relevantChunks);
      const contextText = relevantChunks.map(c => c.text).join("\n\n");

      // 2. Generate response using RAG
      const finalPrompt = "Context:\n" + contextText + "\n\nPrompt:\n" + (refinedPrompt || draftPrompt);
      const response = await generateContent(finalPrompt);
      setRawResponse(response);

      // 3. Evaluate against SOP
      const evalPrompt = [
        "Evaluate the following prompt execution against this SOP:",
        DEFAULT_SOP,
        customCriteria ? "Additional Custom Criteria:\n" + customCriteria + "\n" : "",
        "Prompt Used:",
        refinedPrompt || draftPrompt,
        "Response Generated:",
        response,
        "Provide a detailed critique based on the Weighted Scoring Matrix and estimate the CAQ score. Format as Markdown."
      ].join("\n\n");
      const evaluation = await generateContent(evalPrompt);
      setEvaluationResult(evaluation);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Error during evaluation. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const generatePDF = async () => {
    const element = document.getElementById("report-content");
    if (!element) return;
    
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save("workflow-report.pdf");
    } catch (error) {
      console.error("Error generating PDF:", error);
    }
  };

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col">
        <div className="p-6 border-b border-zinc-200">
          <h1 className="text-xl font-bold tracking-tight text-zinc-800 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            Surgical RAG
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Prompt Engineering Studio</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button
            id="tab-context"
            onClick={() => setActiveTab("context")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === "context" ? "bg-indigo-50 text-indigo-700" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            <Database className="w-4 h-4" />
            1. Context Setup
          </button>
          <button
            id="tab-prompt"
            onClick={() => setActiveTab("prompt")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === "prompt" ? "bg-indigo-50 text-indigo-700" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            <Settings className="w-4 h-4" />
            2. Prompt Crafting
          </button>
          <button
            id="tab-evaluate"
            onClick={() => setActiveTab("evaluate")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === "evaluate" ? "bg-indigo-50 text-indigo-700" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            <Play className="w-4 h-4" />
            3. Evaluate & RAG
          </button>
          <button
            id="tab-report"
            onClick={() => setActiveTab("report")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === "report" ? "bg-indigo-50 text-indigo-700" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            <FileOutput className="w-4 h-4" />
            4. Workflow Report
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8">
          
          {activeTab === "context" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Context Setup</h2>
                <p className="text-zinc-500 mt-1">Upload documents to build your local vector database.</p>
              </div>
              
              <div className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm text-center">
                <Upload className="w-10 h-10 text-zinc-400 mx-auto mb-4" />
                <h3 className="text-sm font-medium text-zinc-900">Upload Knowledge Base</h3>
                <p className="text-xs text-zinc-500 mt-1 mb-6">Supports .txt, .md, .pdf</p>
                {isProcessing ? (
                  <div className="w-full max-w-xs mx-auto">
                    <div className="flex justify-between text-xs font-medium text-zinc-700 mb-1">
                      <span>Processing files...</span>
                      <span>{uploadProgress ?? 0}%</span>
                    </div>
                    <div className="w-full bg-zinc-200 rounded-full h-2.5">
                      <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress ?? 0}%` }}></div>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
                    Select Files
                    <input type="file" multiple accept=".txt,.md,.pdf" className="hidden" onChange={handleFileUpload} disabled={isProcessing} />
                  </label>
                )}
              </div>

              {documents.length > 0 && (
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
                    <h3 className="text-sm font-medium text-zinc-900">Embedded Documents</h3>
                  </div>
                  <ul className="divide-y divide-zinc-100">
                    {documents.map((doc, i) => (
                      <li key={i} className="px-6 py-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 text-indigo-500" />
                            <span className="text-sm font-medium text-zinc-700">{doc.name}</span>
                          </div>
                          <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md">{doc.chunks} chunks</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-zinc-500 pl-7">
                          <span>{(doc.size / 1024).toFixed(1)} KB</span>
                          <span>{doc.wordCount.toLocaleString()} words</span>
                          <span>{new Date(doc.uploadTimestamp).toLocaleTimeString()}</span>
                        </div>
                        {doc.chunkIds && doc.chunkIds.length > 0 && (
                          <div className="pl-7 mt-2">
                            <details className="text-xs text-zinc-500">
                              <summary className="cursor-pointer hover:text-zinc-700 font-medium">View Chunk UUIDs</summary>
                              <div className="mt-2 max-h-32 overflow-y-auto bg-zinc-50 p-2 rounded border border-zinc-100">
                                <ul className="list-disc pl-4 space-y-1">
                                  {doc.chunkIds.map((id) => (
                                    <li key={id} className="font-mono text-[10px]">{id}</li>
                                  ))}
                                </ul>
                              </div>
                            </details>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {activeTab === "prompt" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Prompt Crafting</h2>
                <p className="text-zinc-500 mt-1">Draft and refine your prompt for maximum token efficiency.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Draft Prompt</label>
                  <textarea
                    id="draft-prompt-input"
                    value={draftPrompt}
                    onChange={(e) => setDraftPrompt(e.target.value)}
                    placeholder="Enter your initial prompt here..."
                    className="w-full h-32 p-4 rounded-xl border border-zinc-200 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-sm"
                  />
                </div>
                
                <button
                  id="btn-refine-prompt"
                  onClick={handleRefinePrompt}
                  disabled={!draftPrompt || isRefining}
                  className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {isRefining ? "Refining..." : "Surgically Refine Prompt"}
                </button>

                {refinedPrompt && (
                  <div className="pt-4">
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Refined Prompt</label>
                    <textarea
                      id="refined-prompt-input"
                      value={refinedPrompt}
                      onChange={(e) => setRefinedPrompt(e.target.value)}
                      className="w-full h-32 p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "evaluate" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Evaluate & RAG</h2>
                <p className="text-zinc-500 mt-1">Run your prompt against the vector database and evaluate using the SOP.</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Play className="w-4 h-4 text-indigo-600 ml-0.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-zinc-900">Execution Engine</h3>
                    <p className="text-xs text-zinc-500">Retrieves top-K chunks and evaluates response.</p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Custom Evaluation Criteria (Optional)</label>
                  <textarea
                    id="custom-criteria-input"
                    value={customCriteria}
                    onChange={(e) => setCustomCriteria(e.target.value)}
                    placeholder="Add any specific metrics or rules to evaluate against..."
                    className="w-full h-24 p-3 rounded-xl border border-zinc-200 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-sm"
                  />
                </div>
                
                <button
                  id="btn-run-eval"
                  onClick={handleEvaluate}
                  disabled={isEvaluating || (!draftPrompt && !refinedPrompt)}
                  className="w-full py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isEvaluating ? "Executing Pipeline..." : "Run RAG & Evaluate"}
                </button>
              </div>

              {retrievedChunks.length > 0 && (
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-medium text-zinc-900">Retrieved Context Chunks</h3>
                  </div>
                  <div className="p-6 space-y-4">
                    {retrievedChunks.map((chunk, index) => (
                      <div key={index} className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
                        <div className="text-xs font-medium text-zinc-500 mb-2">Chunk {index + 1} {chunk.metadata?.filename ? `(${chunk.metadata.filename})` : ""}</div>
                        <p className="text-sm text-zinc-700 whitespace-pre-wrap">{chunk.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rawResponse && (
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden mt-6">
                  <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-medium text-zinc-900">LLM Raw Response</h3>
                  </div>
                  <div className="p-6 prose prose-sm prose-zinc max-w-none">
                    <Markdown>{rawResponse}</Markdown>
                  </div>
                </div>
              )}

              {evaluationResult && (
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden mt-6">
                  <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-medium text-zinc-900">Evaluation Report</h3>
                  </div>
                  <div className="p-6 prose prose-sm prose-zinc max-w-none">
                    <Markdown>{evaluationResult}</Markdown>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "report" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Workflow Report</h2>
                  <p className="text-zinc-500 mt-1">Generate a high-fidelity PDF of your session.</p>
                </div>
                <button
                  id="btn-download-pdf"
                  onClick={generatePDF}
                  className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
                >
                  <FileOutput className="w-4 h-4" />
                  Download PDF
                </button>
              </div>

              <div id="report-content" className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm">
                <h1 className="text-3xl font-bold tracking-tight mb-2">Session Audit Report</h1>
                <p className="text-zinc-500 mb-8">Generated by Surgical RAG Studio</p>
                
                <div className="space-y-8">
                  <section>
                    <h3 className="text-lg font-semibold border-b border-zinc-200 pb-2 mb-4">1. Knowledge Base</h3>
                    {documents.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                        {documents.map((d, i) => <li key={i}>{d.name} ({d.chunks} chunks)</li>)}
                      </ul>
                    ) : (
                      <p className="text-sm text-zinc-500 italic">No documents uploaded.</p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-lg font-semibold border-b border-zinc-200 pb-2 mb-4">2. Prompt Evolution</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Draft Prompt</h4>
                        <div className="bg-zinc-50 p-3 rounded-lg text-sm font-mono text-zinc-700 whitespace-pre-wrap">
                          {draftPrompt || "N/A"}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Refined Prompt</h4>
                        <div className="bg-indigo-50 p-3 rounded-lg text-sm font-mono text-indigo-900 whitespace-pre-wrap">
                          {refinedPrompt || "N/A"}
                        </div>
                      </div>
                    </div>
                  </section>

                  {rawResponse && (
                    <section>
                      <h3 className="text-lg font-semibold border-b border-zinc-200 pb-2 mb-4">3. LLM Raw Response</h3>
                      <div className="prose prose-sm prose-zinc max-w-none">
                        <Markdown>{rawResponse}</Markdown>
                      </div>
                    </section>
                  )}

                  {evaluationResult && (
                    <section>
                      <h3 className="text-lg font-semibold border-b border-zinc-200 pb-2 mb-4">4. Evaluation Summary</h3>
                      <div className="prose prose-sm prose-zinc max-w-none">
                        <Markdown>{evaluationResult}</Markdown>
                      </div>
                    </section>
                  )}

                  <section>
                    <h3 className="text-lg font-semibold border-b border-zinc-200 pb-2 mb-4">5. High-Fidelity Event Log</h3>
                    <div className="bg-zinc-900 rounded-xl p-4 overflow-x-auto">
                      <table className="w-full text-left text-xs text-zinc-300">
                        <thead>
                          <tr className="border-b border-zinc-700">
                            <th className="pb-2 font-medium">Time</th>
                            <th className="pb-2 font-medium">Action</th>
                            <th className="pb-2 font-medium">Target ID</th>
                            <th className="pb-2 font-medium">Context</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {events.map((e, i) => (
                            <tr key={i}>
                              <td className="py-2 text-zinc-500">{new Date(e.timestamp).toLocaleTimeString()}</td>
                              <td className="py-2"><span className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">{e.type}</span></td>
                              <td className="py-2 font-mono text-indigo-400">{e.targetId}</td>
                              <td className="py-2 truncate max-w-[200px]">{e.targetText || e.targetTag}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <RecorderProvider>
      <AppContent />
    </RecorderProvider>
  );
}
