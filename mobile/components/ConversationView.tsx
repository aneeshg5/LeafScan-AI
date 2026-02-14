import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { ArrowLeft, Send, Mic, Image as ImageIcon } from 'lucide-react-native';
import { ChatSession, ChatMessage } from '../types';
import { useRef, useEffect, useState } from 'react';

interface Props {
  chat: ChatSession;
  onBack: () => void;
  onSendMessage: (text: string) => void;
}

export default function ConversationView({ chat, onBack, onSendMessage }: Props) {
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  }, [chat.messages]);

  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  return (
    <View className="flex-1 bg-app-bg">
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-white/5 bg-app-bg z-10">
        <TouchableOpacity onPress={onBack} className="mr-4">
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <View>
          <Text className="text-white font-bold text-lg">{chat.title}</Text>
          <Text className="text-app-accent text-xs font-bold">{chat.mode}</Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView 
        className="flex-1 px-4 py-4" 
        ref={scrollViewRef}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        {chat.messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <View 
              key={msg.id} 
              className={`flex-row mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <View 
                className={`max-w-[80%] p-4 rounded-2xl ${
                  isUser 
                    ? 'bg-app-accent rounded-tr-none' 
                    : 'bg-app-card border border-white/5 rounded-tl-none'
                }`}
              >
                <Text className={`text-sm ${isUser ? 'text-app-bg font-bold' : 'text-app-text'}`}>
                  {msg.text}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Input Area */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View className="p-4 bg-app-card border-t border-white/5 flex-row items-center pb-8">
          <TouchableOpacity className="mr-3">
            <ImageIcon size={24} color="#8A9A91" />
          </TouchableOpacity>
          <View className="flex-1 bg-app-bg rounded-full px-4 py-2 border border-white/10 flex-row items-center mr-3">
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about your crops..."
              placeholderTextColor="#525252"
              className="flex-1 text-white max-h-20"
              multiline
            />
          </View>
          {inputText ? (
            <TouchableOpacity onPress={handleSend} className="bg-app-accent w-10 h-10 rounded-full items-center justify-center">
              <Send size={20} color="#101A14" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity className="bg-app-card border border-white/10 w-10 h-10 rounded-full items-center justify-center">
              <Mic size={20} color="#8A9A91" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
