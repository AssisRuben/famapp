import React from 'react';
import { Pressable, StyleSheet, View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  onPress?: () => void;
}

// Com onPress, o próprio card vira a área clicável (mesmo elemento que
// desenha o fundo/sombra) — evita o card visual "vazar" pra fora da
// área que realmente responde ao toque, que é o que acontecia
// envolvendo um Card num Pressable separado.
export function Card({ style, children, onPress, ...rest }: CardProps) {
  if (onPress) {
    return (
      <Pressable style={[styles.card, style]} onPress={onPress} {...rest}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
