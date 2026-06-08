import React from 'react';
import { View, FlatList, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Text, Card } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppScreen } from '@/components/layout/AppScreen';
import { COLORS } from '@/constants/theme';

interface GuidelineSource {
  name: string;
  description: string;
  url: string;
}

const SOURCES: GuidelineSource[] = [
  { name: 'WHO Guidelines', description: 'World Health Organization clinical & public-health guidance', url: 'https://www.who.int/publications/who-guidelines' },
  { name: 'NICE Guidance', description: 'UK National Institute for Health and Care Excellence', url: 'https://www.nice.org.uk/guidance' },
  { name: 'CDC Recommendations', description: 'US Centers for Disease Control and Prevention', url: 'https://www.cdc.gov/' },
  { name: 'Cochrane Library', description: 'Systematic reviews of healthcare interventions', url: 'https://www.cochranelibrary.com/' },
  { name: 'BMJ Best Practice', description: 'Evidence-based clinical decision support', url: 'https://bestpractice.bmj.com/' },
];

export default function GuidelinesScreen() {
  return (
    <AppScreen title="Guidelines">
      <FlatList
        data={SOURCES}
        keyExtractor={(s) => s.name}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.intro}>
            Quick links to the evidence sources Aboy AI cites. Tap to open the official site.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(item.url)}>
            <Card style={styles.card} mode="outlined">
              <Card.Content style={styles.cardContent}>
                <View style={styles.iconWrap}>
                  <MaterialCommunityIcons name="clipboard-text" size={22} color={COLORS.primary} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.desc}>{item.description}</Text>
                </View>
                <MaterialCommunityIcons name="open-in-new" size={18} color={COLORS.textSecondary} />
              </Card.Content>
            </Card>
          </TouchableOpacity>
        )}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  intro: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 6 },
  card: { backgroundColor: COLORS.surface },
  cardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  name: { fontSize: 15.5, fontWeight: '700', color: COLORS.text },
  desc: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2, lineHeight: 17 },
});
