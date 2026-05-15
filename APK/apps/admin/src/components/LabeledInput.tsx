import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
  hasError?: boolean;
  helperText?: string;
};

export const LabeledInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = "none",
  editable = true,
  hasError = false,
  helperText = ""
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
      editable={editable}
      style={[styles.input, !editable && styles.inputReadonly, hasError && styles.inputError]}
    />
    {helperText ? <Text style={[styles.helperText, hasError && styles.helperTextError]}>{helperText}</Text> : null}
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
  },
  inputReadonly: {
    borderColor: "#2c8a62",
    backgroundColor: "#12281f",
    color: "#dcffe8"
  },
  inputError: {
    borderColor: "#d85656"
  },
  helperText: {
    color: "#90a4c6",
    fontSize: 11,
    marginTop: 4
  },
  helperTextError: {
    color: "#ff9e9e"
  }
});
