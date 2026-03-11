import type { AnalysisReport } from "@/lib/api/analysis";
import type { ConsensusReport } from "@/lib/api/consensus";

interface JSONLDProps {
  report?: AnalysisReport | ConsensusReport | null;
}

export function JSONLD({ report }: JSONLDProps) {
  if (!report) return null;

  const isAnalysis = (r: any): r is AnalysisReport => "signal" in r;
  
  const signal = isAnalysis(report) ? report.signal : report.consensus_signal;
  const confidence = isAnalysis(report) ? report.confidence : report.consensus_confidence;
  const author = "AXIOM EPOCH V5";

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FinancialAnalysis",
    "name": `${report.symbol} Real-time Market Analysis`,
    "author": {
      "@type": "Organization",
      "name": author
    },
    "datePublished": report.timestamp,
    "description": `Based on Axiom Consensus Protocol (Multi-Agent Swarm). Signal: ${signal}, Confidence: ${confidence}.`,
    "about": {
      "@type": "Thing",
      "name": report.symbol
    },
    "potentialAction": {
      "@type": "BuyAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": `https://axiom-insight.com/consensus?symbol=${report.symbol}`,
        "description": "View Deep Analysis"
      }
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
