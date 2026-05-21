import { View, Text, StyleSheet } from "react-native";

export default function RequestsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Requests</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { fontSize: 20 },
});
