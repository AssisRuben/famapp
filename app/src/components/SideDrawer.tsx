import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

const LARGURA_PAINEL = 260;

export interface SideDrawerItem {
  label: string;
  emoji: string;
  onPress: () => void;
  perigo?: boolean;
}

interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  items: SideDrawerItem[];
}

export function SideDrawer({ visible, onClose, items }: SideDrawerProps) {
  const translateX = useRef(new Animated.Value(-LARGURA_PAINEL)).current;

  useEffect(() => {
    if (visible) {
      translateX.setValue(-LARGURA_PAINEL);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, translateX]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.painel, { transform: [{ translateX }] }]}>
        <Text style={styles.titulo}>Mais opções</Text>
        <ScrollView
          style={styles.itemsScroll}
          contentContainerStyle={styles.itemsConteudo}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item, index) => (
            <React.Fragment key={item.label}>
              {item.perigo && index > 0 && <View style={styles.divisor} />}
              <Pressable style={styles.item} onPress={item.onPress}>
                <Text style={styles.itemEmoji}>{item.emoji}</Text>
                <Text style={[styles.itemLabel, item.perigo && styles.itemLabelPerigo]}>{item.label}</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  painel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: LARGURA_PAINEL,
    backgroundColor: colors.white,
    paddingTop: 56,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 2, height: 0 },
    elevation: 8,
  },
  titulo: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  itemsScroll: { flex: 1, paddingHorizontal: 12 },
  itemsConteudo: { paddingBottom: 24 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  itemEmoji: { fontSize: 20, width: 24, textAlign: 'center' },
  itemLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  itemLabelPerigo: { color: colors.red },
  divisor: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 8,
    marginHorizontal: 8,
  },
});
