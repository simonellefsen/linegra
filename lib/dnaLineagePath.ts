export const DNA_BLOOD_PATH_RELATIONSHIP_TYPES = new Set(['bio_father', 'bio_mother', 'child']);

export interface BloodRelationshipEdge {
  id: string;
  person_id: string;
  related_id: string;
  type?: string;
}

/**
 * One recorded shared-ancestor route between two people. These routes describe
 * tree topology only; a shared DNA segment does not independently prove each
 * route when a pedigree contains multiple common ancestors.
 */
export interface RecordedSharedAncestorLineage {
  mrcaPersonId: string;
  pathPersonIds: string[];
  pathRelationshipIds: string[];
  focusGenerations: number;
  counterpartGenerations: number;
}

export const buildChildToParentsMap = (relationshipRows: BloodRelationshipEdge[]) => {
  const childToParents = new Map<string, Set<string>>();
  const addParent = (childId: string, parentId: string) => {
    if (!childId || !parentId || childId === parentId) return;
    const parents = childToParents.get(childId) || new Set<string>();
    parents.add(parentId);
    childToParents.set(childId, parents);
  };

  relationshipRows.forEach((rel) => {
    if (!rel.type || !DNA_BLOOD_PATH_RELATIONSHIP_TYPES.has(rel.type)) return;
    if (rel.type === 'bio_father' || rel.type === 'bio_mother') {
      addParent(rel.related_id, rel.person_id);
      return;
    }
    if (rel.type === 'child') {
      addParent(rel.related_id, rel.person_id);
      return;
    }
  });

  return childToParents;
};

export const buildParentToChildrenMap = (childToParents: Map<string, Set<string>>) => {
  const parentToChildren = new Map<string, Set<string>>();
  childToParents.forEach((parents, childId) => {
    parents.forEach((parentId) => {
      const children = parentToChildren.get(parentId) || new Set<string>();
      children.add(childId);
      parentToChildren.set(parentId, children);
    });
  });
  return parentToChildren;
};

interface AncestorTraversalStep {
  childPersonId: string;
  relationshipId: string;
}

interface AncestorTraversal {
  depths: Map<string, number>;
  /** For each discovered ancestor, the child used to reach it from the start person. */
  predecessorByAncestor: Map<string, AncestorTraversalStep>;
}

const buildChildToParentEdges = (relationshipRows: BloodRelationshipEdge[]) => {
  const parentEdgesByChild = new Map<string, Array<{ parentPersonId: string; relationshipId: string }>>();
  relationshipRows.forEach((relationship) => {
    if (
      !relationship.id ||
      !relationship.person_id ||
      !relationship.related_id ||
      !relationship.type ||
      !DNA_BLOOD_PATH_RELATIONSHIP_TYPES.has(relationship.type) ||
      relationship.person_id === relationship.related_id
    ) {
      return;
    }
    const edges = parentEdgesByChild.get(relationship.related_id) || [];
    edges.push({ parentPersonId: relationship.person_id, relationshipId: relationship.id });
    parentEdgesByChild.set(relationship.related_id, edges);
  });
  return parentEdgesByChild;
};

const findAncestors = (
  startPersonId: string,
  parentEdgesByChild: Map<string, Array<{ parentPersonId: string; relationshipId: string }>>
): AncestorTraversal => {
  const depths = new Map<string, number>([[startPersonId, 0]]);
  const predecessorByAncestor = new Map<string, AncestorTraversalStep>();
  const queue = [startPersonId];

  while (queue.length) {
    const childPersonId = queue.shift()!;
    const depth = depths.get(childPersonId)!;
    (parentEdgesByChild.get(childPersonId) || []).forEach(({ parentPersonId, relationshipId }) => {
      if (depths.has(parentPersonId)) return;
      depths.set(parentPersonId, depth + 1);
      predecessorByAncestor.set(parentPersonId, { childPersonId, relationshipId });
      queue.push(parentPersonId);
    });
  }

  return { depths, predecessorByAncestor };
};

/** Rebuilds a single shortest route from an ancestor down to the starting person. */
const reconstructAncestorToStartPath = (
  ancestorPersonId: string,
  startPersonId: string,
  predecessorByAncestor: Map<string, AncestorTraversalStep>
) => {
  const pathPersonIds = [ancestorPersonId];
  const pathRelationshipIds: string[] = [];
  let currentPersonId = ancestorPersonId;

  while (currentPersonId !== startPersonId) {
    const step = predecessorByAncestor.get(currentPersonId);
    if (!step) return null;
    pathRelationshipIds.push(step.relationshipId);
    pathPersonIds.push(step.childPersonId);
    currentPersonId = step.childPersonId;
  }

  return { pathPersonIds, pathRelationshipIds };
};

/**
 * Finds the recorded common ancestors and one shortest tree route through each.
 * This deliberately does not replace the primary DNA path: alternate routes are
 * useful evidence in endogamous/pedigree-collapse cases, but are informational.
 */
export const findRecordedSharedAncestorLineages = (
  focusPersonId: string,
  counterpartPersonId: string,
  relationshipRows: BloodRelationshipEdge[],
  maxLineages = 12
): RecordedSharedAncestorLineage[] => {
  if (!focusPersonId || !counterpartPersonId || focusPersonId === counterpartPersonId || maxLineages < 1) {
    return [];
  }

  const parentEdgesByChild = buildChildToParentEdges(relationshipRows);
  const focusAncestors = findAncestors(focusPersonId, parentEdgesByChild);
  const counterpartAncestors = findAncestors(counterpartPersonId, parentEdgesByChild);
  const sharedAncestorIds = Array.from(focusAncestors.depths.keys()).filter(
    (personId) => personId !== focusPersonId && personId !== counterpartPersonId && counterpartAncestors.depths.has(personId)
  );

  return sharedAncestorIds
    .map((mrcaPersonId) => {
      const focusGenerations = focusAncestors.depths.get(mrcaPersonId)!;
      const counterpartGenerations = counterpartAncestors.depths.get(mrcaPersonId)!;
      const mrcaToFocus = reconstructAncestorToStartPath(
        mrcaPersonId,
        focusPersonId,
        focusAncestors.predecessorByAncestor
      );
      const mrcaToCounterpart = reconstructAncestorToStartPath(
        mrcaPersonId,
        counterpartPersonId,
        counterpartAncestors.predecessorByAncestor
      );
      if (!mrcaToFocus || !mrcaToCounterpart) return null;

      return {
        mrcaPersonId,
        pathPersonIds: [
          ...mrcaToFocus.pathPersonIds.slice().reverse(),
          ...mrcaToCounterpart.pathPersonIds.slice(1),
        ],
        pathRelationshipIds: [
          ...mrcaToFocus.pathRelationshipIds.slice().reverse(),
          ...mrcaToCounterpart.pathRelationshipIds,
        ],
        focusGenerations,
        counterpartGenerations,
      };
    })
    .filter((lineage): lineage is RecordedSharedAncestorLineage => lineage !== null)
    .sort((left, right) => {
      const leftTotal = left.focusGenerations + left.counterpartGenerations;
      const rightTotal = right.focusGenerations + right.counterpartGenerations;
      if (leftTotal !== rightTotal) return leftTotal - rightTotal;
      const leftLongest = Math.max(left.focusGenerations, left.counterpartGenerations);
      const rightLongest = Math.max(right.focusGenerations, right.counterpartGenerations);
      if (leftLongest !== rightLongest) return leftLongest - rightLongest;
      return left.mrcaPersonId.localeCompare(right.mrcaPersonId);
    })
    .slice(0, maxLineages);
};

/** True when outer nodes are different parents of the same child (spouse bridge — not a DNA path). */
export const pathHasCoparentBridge = (
  pathPersonIds: string[],
  childToParents: Map<string, Set<string>>
) => {
  if (pathPersonIds.length < 3) return false;
  for (let index = 1; index < pathPersonIds.length - 1; index += 1) {
    const left = pathPersonIds[index - 1];
    const middle = pathPersonIds[index];
    const right = pathPersonIds[index + 1];
    const parents = childToParents.get(middle);
    if (!parents || parents.size < 2) continue;
    if (parents.has(left) && parents.has(right) && left !== right) {
      return true;
    }
  }
  return false;
};

export const findDnaBloodRelationshipPath = (
  fromPersonId: string,
  toPersonId: string,
  relationshipRows: BloodRelationshipEdge[]
) => {
  if (fromPersonId === toPersonId) {
    return { pathPersonIds: [fromPersonId], pathRelationshipIds: [] };
  }

  const childToParents = buildChildToParentsMap(relationshipRows);
  const parentToChildren = buildParentToChildrenMap(childToParents);

  const adjacency = new Map<string, Array<{ nextPersonId: string; relationshipId: string }>>();
  relationshipRows.forEach((rel) => {
    if (!rel.id || !rel.person_id || !rel.related_id || !rel.type) return;
    if (!DNA_BLOOD_PATH_RELATIONSHIP_TYPES.has(rel.type)) return;
    const fromLinks = adjacency.get(rel.person_id) || [];
    fromLinks.push({ nextPersonId: rel.related_id, relationshipId: rel.id });
    adjacency.set(rel.person_id, fromLinks);

    const toLinks = adjacency.get(rel.related_id) || [];
    toLinks.push({ nextPersonId: rel.person_id, relationshipId: rel.id });
    adjacency.set(rel.related_id, toLinks);
  });

  const queue: Array<{ personId: string; descendedFromParentId: string | null }> = [
    { personId: fromPersonId, descendedFromParentId: null },
  ];
  const visited = new Set<string>([fromPersonId]);
  const previous = new Map<string, { previousPersonId: string; relationshipId: string }>();

  while (queue.length) {
    const { personId: current, descendedFromParentId } = queue.shift()!;
    if (current === toPersonId) break;

    const edges = adjacency.get(current) || [];
    edges.forEach((edge) => {
      const nextPersonId = edge.nextPersonId;
      if (visited.has(nextPersonId)) return;

      const parentsOfCurrent = childToParents.get(current);
      const ascendsToParent = parentsOfCurrent?.has(nextPersonId) ?? false;
      if (ascendsToParent && descendedFromParentId && nextPersonId !== descendedFromParentId) {
        return;
      }

      const descendsToChild = parentToChildren.get(current)?.has(nextPersonId) ?? false;
      const nextDescendedFromParentId = descendsToChild
        ? current
        : ascendsToParent
        ? null
        : descendedFromParentId;

      visited.add(nextPersonId);
      previous.set(nextPersonId, {
        previousPersonId: current,
        relationshipId: edge.relationshipId,
      });
      queue.push({ personId: nextPersonId, descendedFromParentId: nextDescendedFromParentId });
    });
  }

  if (!visited.has(toPersonId)) return null;

  const pathPersonIds: string[] = [toPersonId];
  const pathRelationshipIds: string[] = [];
  let cursor = toPersonId;
  while (cursor !== fromPersonId) {
    const step = previous.get(cursor);
    if (!step) return null;
    pathRelationshipIds.push(step.relationshipId);
    pathPersonIds.push(step.previousPersonId);
    cursor = step.previousPersonId;
  }
  pathPersonIds.reverse();
  pathRelationshipIds.reverse();

  if (pathHasCoparentBridge(pathPersonIds, childToParents)) {
    return null;
  }

  return { pathPersonIds, pathRelationshipIds };
};
