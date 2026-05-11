import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
};

export const LabeledInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = "none"
}: Props): React.JSX.Element => (
  <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#7f8a9a"
      secureTextEntry={secureTextEntry}
      autoCapitalize={autoCapitalize}
      style={styles.input}
    />
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12
  },
  label: {
    color: "#dbe6ff",
    fontSize: 13,
    marginBottom: 6,
    letterSpacing: 0.3
  },
  input: {
    borderWidth: 1,
    borderColor: "#3f4d63",
    borderRadius: 10,
    backgroundColor: "#0d1522",
    color: "#eef4ff",
    paddingHorizontal: 12,
    paddingVertical: 10
  }
});
