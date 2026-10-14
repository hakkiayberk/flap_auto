import json
import unittest
from analyzers.token_namer import suggest_token
from api.examples import list_examples


class NamingTest(unittest.TestCase):
    def test_specific_panda_name_precedes_animal_keyword(self):
        self.assertEqual(suggest_token('微博热搜熊猫---萌兰')['name'], '萌兰')

    def test_cross_language_aliases_produce_chinese_candidates(self):
        for title, name in [('Introducing the all-new Black Shiba', '黑柴'), ('泡菜应该使用韩国股票', '泡菜'), ('김치', '泡菜')]:
            result = suggest_token(title)
            self.assertEqual(result['name'], name)
            self.assertFalse(result['launch_eligible'])
            self.assertFalse(result['virality_verified'])

    def test_ambiguous_or_unknown_subject_does_not_get_a_fabricated_name(self):
        self.assertIsNone(suggest_token('Black Shiba meets 萌兰')['name'])
        self.assertIsNone(suggest_token('全国秋粮收获进入高峰期')['name'])
        self.assertIsNone(suggest_token('black shibarium')['name'])

    def test_longest_generic_keyword_is_preserved_with_low_confidence(self):
        result = suggest_token('大熊猫正在吃竹子')
        self.assertEqual(result['name'], '大熊猫')
        self.assertEqual(result['confidence'], 'low')
        self.assertTrue(result['review_required'])

    def test_reference_pairs_preserve_non_bnb_quotes_without_enabling_trades(self):
        examples = list_examples()['items']
        self.assertEqual([e['observed_quote_asset'] for e in examples], ['EWYB', 'FXIon', 'BABAB'])
        self.assertEqual([e['observed_token_label'] for e in examples], ['김치', '萌兰', '黑柴'])
        self.assertEqual(len({e['token_address'] for e in examples}), 3)
