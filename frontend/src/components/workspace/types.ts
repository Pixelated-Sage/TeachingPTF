// frontend/src/components/workspace/types.ts
// Shared TypeScript interfaces used across workspace sub-components.

export interface HeadingManifestItem {
  id: number;
  title: string;
  level: number;
}

export interface NotesData {
  id: string;
  topicNumber: number;
  title: string;
  markdownContent: string;
  headingsManifest?: HeadingManifestItem[];
}

export interface QuestionData {
  id: string;
  topicNumber: number;
  codeTaskPrompt: string;
  reasoningPrompt: string;
  reasoningType: 'typed' | 'mcq' | 'multi_select';
  options?: string[];
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

export type WorkspaceMode = 'live' | 'test' | 'assignment';
export type RunStatus = 'idle' | 'installing' | 'running' | 'done' | 'error';
