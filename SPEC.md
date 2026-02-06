# Linegra - Next-Generation Genealogy Platform Specification

## 1. Overview
Linegra is a modern, high-performance web application designed to replace legacy genealogy software with a "Modern Archive" aesthetic. It emphasizes interactive storytelling, genetic genealogy integration, and AI-assisted data entry.

## 2. Technical Stack
- **Frontend Framework**: React 19 (via esm.sh)
- **Styling**: Tailwind CSS
- **Visualization**: D3.js for interactive kinship maps
- **Icons**: Lucide React
- **Backend/Auth**: Supabase (PostgreSQL + GoTrue)
- **Artificial Intelligence**: Google Gemini API (@google/genai)
  - **gemini-3-flash-preview**: Powering narrative generation and location parsing.

## 3. Core Features

### 3.1. Interactive Kinship Engine (FamilyTree.tsx)
- **Force-Directed Graph**: Uses D3.js to render complex family relationships.
- **DNA Visualization**: Verified genetic paths are highlighted with pulsing blue gradients.
- **Confidence Layer**: Relationship links are styled based on researcher confidence (Confirmed, Probable, Assumed, Speculative). 
- **Adaptive UI**: Responsive zoom levels with an overlay showing current zoom and legend.

### 3.2. Person Archive (PersonProfile.tsx)
- **Tabbed UI Architecture**: Data is organized into clean, focused tabs (Vital, Family, Story, Sources, Media, DNA, Notes) for improved cognitive focus.
- **Identity Management**: Identity section features a signature blue fingerprint icon and supports multiple alternate names (nicknames, aliases, anglicized names).
- **Death Record Nuance**: Enhanced Vital tab allows capturing both the *Place of Death* (e.g., a specific hospital or ship at sea) and the *Residence at Death* (legal home address), providing a more complete historical context.
- **Multi-Event Life Chronology**: Support for multiple instances of the same event type (e.g., multiple Residence records, various Military Service stints, different Education levels).
- **Granular Citation Management**: Each life event features a direct "Citations" link to create specific source records proving that individual event, rather than just general profile proof.
- **Relationship Assessment**: Family tab allows researchers to label links with quality assessments, serving as a metadata layer for the tree engine.

### 3.3. Smart Data Entry (Input Components)
- **Fluent Dates**: Handles genealogical nuances like "Circa", "Abt", and date ranges.
- **AI Place Parser**: Uses Gemini to convert unstructured strings into structured data (City, Parish, County, etc.) and provides historical context.

### 3.4. Research Dashboard (TreeLandingPage.tsx)
- **Dynamic Widgets**:
  - **What's New**: Real-time feed of recent archive updates.
  - **Anniversaries**: Automatic calendar detection for family birthdays.
  - **Most Wanted**: Identifies profiles missing critical data to guide research.
  - **Random Media**: Grayscale-to-color interactive media highlights.

### 3.5. Advanced Interoperability (ImportExport.tsx)
- **Enhanced GEDCOM Support**: Robust ingestion of standard `.ged` files (v5.5.1) including INDI, FAM, MARR, and CHIL tags to automatically reconstruct complex family structures and vital records.

## 4. Visual Identity
- **Color Palette**: Deep Slate (#0f172a), crisp whites, and accent Blue-500 for genetic and identity data. 
- **Confidence Coding**: 
  - Emerald (Confirmed)
  - Blue (Probable)
  - Indigo (Assumed/Working)
  - Amber (Speculative)
- **Typography**:
  - **Serif**: 'Playfair Display' for names and historical narratives.
  - **Sans**: 'Inter' for data-heavy fields and administrative UI.
- **Design Tokens**: Large border radii (40px/32px), heavy tracking (0.25em) on uppercase labels, and subtle backdrop blurs on headers.
