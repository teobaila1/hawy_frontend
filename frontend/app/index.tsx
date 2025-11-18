// app/index.tsx
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
import i18n from 'i18next';
import { Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';   // <<< Hwarang Gradient

import { useAuth } from '../context/AuthContext';

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

// mesaj inițial
const INITIAL_HAWY_MESSAGE: Message = {
  id: '1',
  text: "Salutare! Eu sunt Hawy Ariciul! 🦔 Sunt super încântat să te învăț totul despre TaeKwon-Do! Întreabă-mă orice despre tull-uri, lovituri cu piciorul, blocaje sau lovituri de pumn! Haide să învățăm împreună! 🥋",
  sender: 'hawy',
  timestamp: new Date(),
};

export default function Index() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_HAWY_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);

  const scrollViewRef = useRef<ScrollView>(null);
  const sessionIdRef = useRef<string | null>(null);

  const { user, initializing, logout } = useAuth();

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
          if (restored.length > 0) setMessages(restored);
        }

        if (storedSessionId) {
          sessionIdRef.current = storedSessionId;
        } else {
          const newSessionId = `session_${Date.now()}`;
          sessionIdRef.current = newSessionId;
          await AsyncStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
        }
      } catch (err) {
        console.error('Error hydrating chat:', err);
      } finally {
        setIsHydrating(false);
      }
    };

    hydrateFromStorage();
  }, []);

  useEffect(() => {
    if (isHydrating) return;
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, isHydrating]);

  const persistMessages = async (msgs: Message[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    } catch (err) {
      console.error('Failed to persist messages:', err);
    }
  };

  const resetChat = async () => {
    const fresh = { ...INITIAL_HAWY_MESSAGE, timestamp: new Date() };
    const newSessionId = `session_${Date.now()}`;

    sessionIdRef.current = newSessionId;
    setMessages([fresh]);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify([fresh])),
      AsyncStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId),
    ]);
  };

  const handleLogout = async () => {
    try {
      await logout();
      await AsyncStorage.removeItem(STORAGE_KEYS.MESSAGES);
      await AsyncStorage.removeItem(STORAGE_KEYS.SESSION_ID);
      setMessages([INITIAL_HAWY_MESSAGE]);
    } catch (err) {
      console.error('Error during logout:', err);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading || isHydrating) return;

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

    setMessages((prev) => {
      const updated = [...prev, userMessage];
      void persistMessages(updated);
      return updated;
    });

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.text,
          session_id: sessionIdRef.current!,
          language: i18n.language,
        }),
      });

      if (!response.ok) {
        throw new Error('Backend error');
      }

      const data = await response.json();

      const hawyMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        sender: 'hawy',
        timestamp: new Date(),
      };

      setMessages((prev) => {
        const updated = [...prev, hawyMessage];
        void persistMessages(updated);
        return updated;
      });
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "Oops! Something went wrong. Try again! 🦔",
        sender: 'hawy',
        timestamp: new Date(),
      };

      setMessages((prev) => {
        const updated = [...prev, errorMsg];
        void persistMessages(updated);
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (initializing || isHydrating) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar style="light" />
        <Text style={styles.loadingTitle}>Loading Hawy…</Text>
      </SafeAreaView>
    );
  }

  if (!user) return <Redirect href="/login" />;

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
    <LinearGradient
      colors={['#0c0c0f', '#1a1a1e', '#5b0a0a']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradientBackground}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.logoContainer}>
              <Text style={styles.logo}>🦔</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>Hawy the Hedgehog Coach</Text>
              <Text style={styles.headerSubtitle}>
                {user?.name
                  ? `${user.name} • Prietenul tău in TaeKwon-Do`
                  : 'Prietenul tău in TaeKwon-Do'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.smallButton} onPress={resetChat}>
              <Text style={styles.smallButtonText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallButton, styles.logoutButton]}
              onPress={handleLogout}
            >
              <Text style={styles.smallButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CHAT */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.chatContainer}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map(renderMessage)}

            {isLoading && (
              <View
                style={[styles.messageContainer, styles.hawyMessageContainer]}
              >
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

          {/* INPUT */}
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#111114',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    color: '#E5E7EB',
    fontSize: 18,
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  logoutButton: {
    borderColor: '#FCA5A5',
  },
  smallButtonText: {
    color: '#E0E7FF',
    fontSize: 12,
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
