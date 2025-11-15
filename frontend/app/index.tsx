import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from "i18next";

// URL backend (Render + .env)
const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  'https://hawy-backend.onrender.com';

const STORAGE_KEYS = {
  MESSAGES: 'hawy_messages',
  SESSION_ID: 'hawy_session_id',
} as const;

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'hawy';
  timestamp: Date;
}

// mesajul inițial al lui Hawy – îl folosim și la reset
const INITIAL_HAWY_MESSAGE: Message = {
  id: '1',
  text: "Hi there! I'm Hawy the Hedgehog! 🦔 I'm super excited to teach you all about TaeKwon-Do! Ask me anything about patterns, kicks, blocks, or punches! Let's learn together! 🥋",
  sender: 'hawy',
  timestamp: new Date(),
};

export default function Index() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_HAWY_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true); // încărcăm istoria din storage

  const scrollViewRef = useRef<ScrollView>(null);
  const sessionIdRef = useRef<string | null>(null); // session_id stabil, salvat în storage

  // 👉 La primul render: încărcăm istoria + session_id din AsyncStorage
  useEffect(() => {
    const hydrateFromStorage = async () => {
      try {
        const [storedMessages, storedSessionId] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.MESSAGES),
          AsyncStorage.getItem(STORAGE_KEYS.SESSION_ID),
        ]);

        if (storedMessages) {
          const parsed = JSON.parse(storedMessages) as any[];
          const restored: Message[] = parsed.map((m) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
          if (restored.length > 0) {
            setMessages(restored);
          }
        }

        if (storedSessionId) {
          sessionIdRef.current = storedSessionId;
        } else {
          const newSessionId = `session_${Date.now()}`;
          sessionIdRef.current = newSessionId;
          await AsyncStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
        }
      } catch (err) {
        console.error('Error hydrating chat from storage:', err);
      } finally {
        setIsHydrating(false);
      }
    };

    hydrateFromStorage();
  }, []);

  // 👉 de fiecare dată când se schimbă mesajele: scroll jos
  useEffect(() => {
    if (isHydrating) return;
    scrollToBottom();
  }, [messages, isHydrating]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // helper: salvează mesajele în AsyncStorage
  const persistMessages = async (msgs: Message[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    } catch (err) {
      console.error('Failed to persist messages:', err);
    }
  };

  // opțional: reset chat (șterge istoria + începe alt session_id)
  const resetChat = async () => {
    const freshMessage: Message = {
      ...INITIAL_HAWY_MESSAGE,
      id: '1',
      timestamp: new Date(),
    };

    const newSessionId = `session_${Date.now()}`;

    sessionIdRef.current = newSessionId;
    setMessages([freshMessage]);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify([freshMessage])),
      AsyncStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId),
    ]);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading || isHydrating) return;

    // ne asigurăm că avem un session_id
    if (!sessionIdRef.current) {
      const newSessionId = `session_${Date.now()}`;
      sessionIdRef.current = newSessionId;
      await AsyncStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setInputText('');
    setIsLoading(true);
    Keyboard.dismiss();

    // adăugăm mesajul userului + salvăm
    setMessages((prev) => {
      const updated = [...prev, userMessage];
      void persistMessages(updated);
      return updated;
    });

    try {
      const currentSessionId = sessionIdRef.current!;
      console.log('Sending message to:', `${BACKEND_URL}/api/chat`);

      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.text,
          session_id: currentSessionId,
          language: i18n.language,        // <--- AICI trimitem “en” sau “ro”
        }),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        throw new Error(`Failed to get response: ${response.status}`);
      }

      const data = await response.json();
      console.log('Response data received');

      const hawyMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        sender: 'hawy',
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      };

      setMessages((prev) => {
        const updated = [...prev, hawyMessage];
        void persistMessages(updated);
        return updated;
      });
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "Oops! I had a little trouble there. Can you try asking again? 🦔",
        sender: 'hawy',
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const updated = [...prev, errorMessage];
        void persistMessages(updated);
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = (message: Message) => {
    const isHawy = message.sender === 'hawy';

    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isHawy ? styles.hawyMessageContainer : styles.userMessageContainer,
        ]}
      >
        {isHawy && (
          <View style={styles.hawyAvatar}>
            <Text style={styles.hawyAvatarText}>🦔</Text>
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isHawy ? styles.hawyBubble : styles.userBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isHawy ? styles.hawyText : styles.userText,
            ]}
          >
            {message.text}
          </Text>
        </View>
        {!isHawy && (
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>👤</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            <Text style={styles.logo}>🦔</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Hawy the Hedgehog</Text>
            <Text style={styles.headerSubtitle}>Your TaeKwon-Do Friend</Text>
          </View>
        </View>

        {/* Buton mic de reset chat */}
        <TouchableOpacity style={styles.resetButton} onPress={resetChat}>
          <Text style={styles.resetButtonText}>Reset chat</Text>
        </TouchableOpacity>
      </View>

      {/* Chat Messages */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(renderMessage)}

          {isLoading && (
            <View style={[styles.messageContainer, styles.hawyMessageContainer]}>
              <View style={styles.hawyAvatar}>
                <Text style={styles.hawyAvatarText}>🦔</Text>
              </View>
              <View
                style={[
                  styles.messageBubble,
                  styles.hawyBubble,
                  styles.loadingBubble,
                ]}
              >
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={styles.loadingText}>Hawy is thinking...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask Hawy about TaeKwon-Do..."
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={500}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isLoading || isHydrating) &&
                  styles.sendButtonDisabled,
              ]}
              onPress={sendMessage}
              disabled={!inputText.trim() || isLoading || isHydrating}
            >
              <Text style={styles.sendButtonText}>➤</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F9FF',
  },
  header: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  logo: {
    fontSize: 32,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#E0E7FF',
    marginTop: 2,
  },
  resetButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  resetButtonText: {
    color: '#E0E7FF',
    fontSize: 12,
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  hawyMessageContainer: {
    justifyContent: 'flex-start',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  hawyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 2,
    borderColor: '#FDE047',
  },
  hawyAvatarText: {
    fontSize: 24,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderWidth: 2,
    borderColor: '#93C5FD',
  },
  userAvatarText: {
    fontSize: 20,
  },
  messageBubble: {
    maxWidth: '70%',
    borderRadius: 20,
    padding: 12,
    paddingHorizontal: 16,
  },
  hawyBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  userBubble: {
    backgroundColor: '#6366F1',
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  hawyText: {
    color: '#1F2937',
  },
  userText: {
    color: '#FFFFFF',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    marginLeft: 8,
    color: '#6B7280',
    fontSize: 14,
    fontStyle: 'italic',
  },
  inputContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
