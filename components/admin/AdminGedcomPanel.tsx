import React from 'react';
import ImportExport from '../ImportExport';
import { Person, Relationship } from '../../types';

interface AdminGedcomPanelProps {
  people: Person[];
  relationships: Relationship[];
  activeTreeName?: string;
  onImport: (data: { people: Person[]; relationships: Relationship[] }) => Promise<void>;
}

const AdminGedcomPanel: React.FC<AdminGedcomPanelProps> = ({
  people,
  relationships,
  activeTreeName,
  onImport,
}) => (
  <ImportExport
    people={people}
    relationships={relationships}
    onImport={onImport}
    activeTreeName={activeTreeName}
    showGedcomSection
  />
);

export default AdminGedcomPanel;
