import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import ChatListView from '../components/ChatListView';
import ConversationView from '../components/ConversationView';
import { ChatSession, ChatMessage } from '../types';

export default function ChatScreen() {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  
  // Dummy State (We will replace this with real DB later)
  const [chats, setChats] = useState<ChatSession[]>([
    {
      id: '1',
      title: 'Corn Leaf Yellowing',
      mode: 'Leaf Diagnosis',
      preview: 'I noticed some yellowing on the midrib...',
      timestamp: new Date(),
      unreadCount: 0,
      messages: [
        { id: 'm1', text: 'I noticed some yellowing on the midrib of my corn.', sender: 'user', timestamp: new Date() },
        { id: 'm2', text: 'Based on the visual patterns, this looks like Nitrogen Deficiency. The yellowing along the midrib is a key indicator.', sender: 'bot', timestamp: new Date() }
      ]
    }
  ]);

  const activeChat = chats.find(c => c.id === activeChatId);

  const handleSendMessage = (text: string) => {
    if (!activeChatId) return;
    
    // Optimistic Update
    const newMessage: ChatMessage = { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() };
    
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
        return { ...c, messages: [...c.messages, newMessage], preview: text };
      }
      return c;
    }));

    // Mock AI Reply
    setTimeout(() => {
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: "I've noted that. Is there anything else you'd like me to check?", sender: 'bot', timestamp: new Date() };
      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return { ...c, messages: [...c.messages, aiMsg], preview: aiMsg.text };
        }
        return c;
      }));
    }, 1000);
  };

  return (
    <SafeAreaView className="flex-1 bg-app-bg" edges={['top']}>
      {activeChatId && activeChat ? (
        <ConversationView 
          chat={activeChat} 
          onBack={() => setActiveChatId(null)}
          onSendMessage={handleSendMessage}
        />
      ) : (
        <ChatListView 
          chats={chats} 
          onSelectChat={setActiveChatId}
          onStartNewChat={() => console.log('New Chat')}
        />
      )}
    </SafeAreaView>
  );
}
