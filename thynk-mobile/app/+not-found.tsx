import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Page not found</Text>
      <Link href="/(tabs)" style={styles.link}>Go to home</Link>
    </View>
  );
}
const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  link:  { fontSize: 14, color: Colors.primary },
});
