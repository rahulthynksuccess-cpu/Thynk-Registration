import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export default function TabsLayout() {
  const [role, setRole] = useState<string>('super_admin');

  useEffect(() => {
    SecureStore.getItemAsync('thynk_user_role').then(r => {
      if (r) setRole(r);
    });
  }, []);

  // Consultants only see: Schools, Add School, Reports
  const isConsultant = role === 'consultant';
  // Only super_admin can create consultants (mirrors the /api/admin/consultants POST restriction)
  const isSuperAdmin = role === 'super_admin';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.tabBarBorder,
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textDim,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index"          options={{ title: 'Schools',    tabBarIcon: ({ color, size }) => <Ionicons name="school-outline"    size={size} color={color} /> }} />
      <Tabs.Screen name="create-school"  options={{ title: 'Add School',  tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="add-consultant" options={isSuperAdmin ? { title: 'Consultant', tabBarIcon: ({ color, size }) => <Ionicons name="person-add-outline" size={size} color={color} /> } : { href: null }} />
      <Tabs.Screen name="students"       options={isConsultant ? { href: null } : { title: 'Students', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="payments"       options={isConsultant ? { href: null } : { title: 'Payments', tabBarIcon: ({ color, size }) => <Ionicons name="card-outline"    size={size} color={color} /> }} />
      <Tabs.Screen name="dashboard"      options={{ title: 'Reports',    tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
