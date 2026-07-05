import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { LineagePathBreadcrumbNode } from '../../lib/dnaLineagePathLabel';

interface DnaLineagePathBreadcrumbProps {
  nodes: LineagePathBreadcrumbNode[];
  className?: string;
}

const DnaLineagePathBreadcrumb: React.FC<DnaLineagePathBreadcrumbProps> = ({ nodes, className = '' }) => {
  if (!nodes.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-1 gap-y-1 ${className}`}>
      {nodes.map((node, index) => (
        <React.Fragment key={node.personId}>
          {index > 0 && <ChevronRight className="w-3 h-3 text-blue-400 shrink-0" aria-hidden />}
          <span className={node.isMrca ? 'font-bold text-blue-950' : 'text-blue-900'}>
            {node.name}
            {node.isMrca ? <span className="ml-1 text-[10px] font-black uppercase tracking-wider text-blue-600">MRCA</span> : null}
          </span>
          {node.edgeLabel && index < nodes.length - 1 ? (
            <span className="text-[10px] text-blue-600/80 italic">({node.edgeLabel})</span>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
};

export default DnaLineagePathBreadcrumb;
