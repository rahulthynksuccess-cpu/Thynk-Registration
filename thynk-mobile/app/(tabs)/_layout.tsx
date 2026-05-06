import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.tabBarBorder,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textDim,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index"     options={{ title: 'Schools',  tabBarIcon: ({ color, size }) => <Ionicons name="school-outline"    size={size} color={color} /> }} />
      <Tabs.Screen name="students"  options={{ title: 'Students', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline"    size={size} color={color} /> }} />
      <Tabs.Screen name="payments"  options={{ title: 'Payments', tabBarIcon: ({ color, size }) => <Ionicons name="card-outline"      size={size} color={color} /> }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Reports',  tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
