export interface AttributeDef {
  key: string;
  label: string;
  type: 'enum' | 'number' | 'boolean' | 'text';
  unit?: string;
  filterable: boolean;
  variantAxis: boolean;
  values?: string[];
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId?: string;
  imageUrl?: string;
  order: number;
  attributeDefs?: AttributeDef[];
}

/** Category with resolved children, as rendered by the mega menu. */
export interface CategoryNode extends Category {
  children: CategoryNode[];
}
