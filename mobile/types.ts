export enum HealthStatus {
    Healthy = 'Healthy',
    Infected = 'Infected',
    Warning = 'Warning',
  }
  
  export interface Diagnosis {
    id: string;
    plantName: string;
    condition: string;
    location: string;
    time: string;
    confidence: number;
    status: HealthStatus;
    imageUrl: string;
  }
  
  export interface UserStats {
    scansToday: number;
    scanIncrease: number;
    highRisks: number;
  }
  
  export interface FieldCondition {
    id: string;
    title: string;
    description: string;
    imageUrl: string;
    alertLevel: 'Low' | 'Medium' | 'High';
  }
  
  export interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
    imageUrl?: string;
  }
  
  export interface ChatSession {
    id: string;
    title: string;
    mode: 'Pest ID' | 'Leaf Diagnosis' | 'General Chat';
    preview: string;
    timestamp: Date;
    messages: ChatMessage[];
    unreadCount: number;
  }
  