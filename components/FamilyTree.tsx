
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Person, Relationship, TreeLayoutType, RelationshipConfidence } from '../types';

interface FamilyTreeProps {
  people: Person[];
  relationships: Relationship[];
  onPersonSelect: (person: Person) => void;
  layout: TreeLayoutType;
}

type SimulationPerson = Person & d3.SimulationNodeDatum;
type SimulationLink = d3.SimulationLinkDatum<SimulationPerson> & {
  id: string;
  type: Relationship['type'];
  confidence: RelationshipConfidence;
};

const FamilyTree: React.FC<FamilyTreeProps> = ({ people, relationships, onPersonSelect, layout }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 1200;
    const height = 800;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");

    // Glow for DNA nodes
    const glow = defs.append("filter")
      .attr("id", "dna-glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");
    glow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
    glow.append("feComposite").attr("in", "SourceGraphic").attr("in2", "blur").attr("operator", "over");

    const g = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        setZoomLevel(event.transform.k);
      });
    svg.call(zoom);

    // Identify links with confidence
    const allLinks: SimulationLink[] = relationships.map(r => ({
      id: r.id,
      source: r.personId,
      target: r.relatedId,
      type: r.type,
      confidence: r.confidence || 'Unknown'
    }));

    const nodes: SimulationPerson[] = people.map((p) => ({ ...p }));

    const simulation = d3.forceSimulation<SimulationPerson>(nodes)
      .force("link", d3.forceLink<SimulationPerson, SimulationLink>(allLinks).id((d) => d.id as string).distance(240))
      .force("charge", d3.forceManyBody().strength(-2500))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const getLinkStroke = (conf: RelationshipConfidence) => {
      switch (conf) {
        case 'Confirmed': return "#10b981"; // Emerald
        case 'Probable': return "#3b82f6"; // Blue
        case 'Assumed': return "#6366f1"; // Indigo
        case 'Speculative': return "#f59e0b"; // Amber
        default: return "#e2e8f0"; // Slate
      }
    };

    const link = g.append("g")
      .selectAll("line")
      .data(allLinks)
      .join("line")
      .attr("stroke", (d: any) => getLinkStroke(d.confidence))
      .attr("stroke-width", (d: any) => d.confidence === 'Confirmed' ? 4 : 2)
      .attr("stroke-opacity", (d: any) => d.confidence === 'Speculative' ? 0.4 : 0.8)
      .attr("stroke-dasharray", (d: any) => ['Assumed', 'Speculative', 'Unknown'].includes(d.confidence) ? "4,4" : "none")
      .attr("class", (d: any) => d.confidence === 'Confirmed' ? "confirmed-link" : "");

    const node = g.append("g")
      .selectAll(".node")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .on("click", (_, d) => onPersonSelect(d))
      .style("cursor", "pointer");

    node.append("rect")
      .attr("width", 170)
      .attr("height", 64)
      .attr("x", -85)
      .attr("y", -32)
      .attr("rx", 18)
      .attr("fill", "#fff")
      .attr("stroke", (d) => d.isDNAMatch ? "#3b82f6" : "#f1f5f9")
      .attr("stroke-width", (d) => d.isDNAMatch ? 3 : 1.5)
      .attr("filter", (d) => d.isDNAMatch ? "url(#dna-glow)" : "none");

    node.append("text")
      .attr("dy", "-0.2em")
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "700")
      .attr("fill", "#0f172a")
      .text((d) => `${d.firstName} ${d.lastName}`);

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimulationPerson).x ?? 0)
        .attr("y1", (d) => (d.source as SimulationPerson).y ?? 0)
        .attr("x2", (d) => (d.target as SimulationPerson).x ?? 0)
        .attr("y2", (d) => (d.target as SimulationPerson).y ?? 0);
      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

  }, [people, relationships, onPersonSelect, layout]);

  return (
    <div className="relative w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] overflow-hidden shadow-inner group">
      <svg ref={svgRef} className="w-full h-full" viewBox="0 0 1200 800" />
      
      <div className="absolute top-8 right-8 flex flex-col gap-3">
        <div className="bg-white/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-200 shadow-2xl flex items-center gap-4">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
          <span className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em]">Kinship Engine</span>
          <div className="w-px h-4 bg-slate-200"></div>
          <span className="text-[11px] font-bold text-slate-500">{Math.round(zoomLevel * 100)}%</span>
        </div>
      </div>

      <div className="absolute bottom-10 left-10">
        <div className="bg-white/95 backdrop-blur-xl p-8 rounded-[40px] border border-slate-200 shadow-2xl space-y-6 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-6 group-hover:translate-y-0">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Confidence Legend</p>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-1.5 bg-emerald-500 rounded-full"></div>
              <span className="text-xs font-bold text-slate-700">Confirmed (Verified)</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-1.5 bg-blue-500 rounded-full"></div>
              <span className="text-xs font-bold text-slate-700">Probable</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-1.5 border-t-2 border-indigo-500 border-dashed"></div>
              <span className="text-xs font-bold text-slate-700">Assumed (Working)</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-1.5 border-t-2 border-amber-500 border-dashed opacity-50"></div>
              <span className="text-xs font-bold text-slate-700 opacity-60">Speculative</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FamilyTree;
