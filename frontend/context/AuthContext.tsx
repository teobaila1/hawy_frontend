// frontend/app/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  'https://hawy-backend.onrender.com';

type User = {
  name: string;
  email: string;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'hawy_token';
const USER_NAME_KEY = 'hawy_user_name';
const USER_EMAIL_KEY = 'hawy_user_email';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // la pornirea aplicației: încărcăm user + token din AsyncStorage
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
        const storedName = await AsyncStorage.getItem(USER_NAME_KEY);
        const storedEmail = await AsyncStorage.getItem(USER_EMAIL_KEY);

        if (storedToken && storedEmail) {
          setToken(storedToken);
          setUser({ name: storedName ?? '', email: storedEmail });
        }
      } catch (err) {
        console.error('Error loading auth from storage:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAuth();
  }, []);

  const saveAuth = async (tokenValue: string, userValue: User) => {
    setToken(tokenValue);
    setUser(userValue);

    await AsyncStorage.multiSet([
      [TOKEN_KEY, tokenValue],
      [USER_NAME_KEY, userValue.name],
      [USER_EMAIL_KEY, userValue.email],
    ]);
  };

  const login = async (email: string, password: string) => {
    const resp = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Login failed:', text);
      throw new Error(text || 'Login failed');
    }

    const data = await resp.json(); // { token, user: { name, email } }
    await saveAuth(data.token, data.user);
  };

  const signup = async (name: string, email: string, password: string) => {
    const resp = await fetch(`${BACKEND_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Signup failed:', text);
      throw new Error(text || 'Signup failed');
    }

    const data = await resp.json(); // { token, user: { name, email } }
    await saveAuth(data.token, data.user);
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_NAME_KEY, USER_EMAIL_KEY]);
  };

  const value: AuthContextType = {
    user,
    token,
    loading,
    login,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
};
