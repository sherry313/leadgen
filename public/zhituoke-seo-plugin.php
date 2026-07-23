<?php
/*
Plugin Name: 智拓客 SEO/GEO 连接器
Description: 连接智拓客，自动往你官网注入 SEO/GEO 结构化数据(Schema)与描述，无需手动复制粘贴。
Version: 1.0
Author: 智拓客
*/
if (!defined('ABSPATH')) exit;

add_action('admin_menu', function () {
  add_options_page('智拓客 SEO', '智拓客 SEO', 'manage_options', 'ztk-seo', 'ztk_seo_settings');
});

function ztk_seo_settings() {
  if (!current_user_can('manage_options')) return;
  if (isset($_POST['ztk_nonce']) && wp_verify_nonce($_POST['ztk_nonce'], 'ztk_save')) {
    update_option('ztk_seo_key', sanitize_text_field($_POST['ztk_key']));
    update_option('ztk_seo_api', esc_url_raw(rtrim(trim($_POST['ztk_api']), '/')));
    delete_transient('ztk_seo_cfg');
    echo '<div class="updated"><p>已保存，配置已刷新。</p></div>';
  }
  $key = esc_attr(get_option('ztk_seo_key', ''));
  $api = esc_attr(get_option('ztk_seo_api', ''));
  echo '<div class="wrap"><h1>智拓客 SEO/GEO 连接器</h1>';
  echo '<p>在智拓客里点「连接官网」拿到<b>站点密钥</b>，连同智拓客网址填到下面。以后你在智拓客里点「发布」，本站首页会自动更新 SEO/GEO 数据，无需再复制。</p>';
  echo '<form method="post"><table class="form-table">';
  echo '<tr><th>智拓客网址</th><td><input name="ztk_api" value="' . $api . '" style="width:420px" placeholder="https://你的智拓客域名" /></td></tr>';
  echo '<tr><th>站点密钥</th><td><input name="ztk_key" value="' . $key . '" style="width:420px" placeholder="从智拓客「连接官网」复制" /></td></tr>';
  echo '</table>';
  wp_nonce_field('ztk_save', 'ztk_nonce');
  echo '<p><button class="button button-primary">保存并连接</button></p></form></div>';
}

// 前台把智拓客生成的 SEO 配置注入 <head>
add_action('wp_head', function () {
  $key = get_option('ztk_seo_key', '');
  $api = get_option('ztk_seo_api', '');
  if (!$key || !$api) return;
  $cfg = get_transient('ztk_seo_cfg');
  if ($cfg === false) {
    $resp = wp_remote_get($api . '/api/seo/site-config?key=' . urlencode($key), array('timeout' => 8));
    if (is_wp_error($resp)) return;
    $cfg = json_decode(wp_remote_retrieve_body($resp), true);
    set_transient('ztk_seo_cfg', $cfg ? $cfg : array('success' => false), HOUR_IN_SECONDS);
  }
  if (!$cfg || empty($cfg['success'])) return;
  // Organization Schema：全站注入；Meta 描述 + FAQ Schema：只首页
  if (!empty($cfg['orgSchema'])) echo "\n" . $cfg['orgSchema'] . "\n";
  if (is_front_page() || is_home()) {
    if (!empty($cfg['metaDescription'])) echo '<meta name="description" content="' . esc_attr($cfg['metaDescription']) . '" />' . "\n";
    if (!empty($cfg['faqSchema'])) echo $cfg['faqSchema'] . "\n";
  }
}, 5);
