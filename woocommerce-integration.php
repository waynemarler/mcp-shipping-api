<?php
/**
 * PineCut4You MCP Shipping Integration
 * 
 * Add this code to your WooCommerce custom shipping method's calculate_shipping() function
 * or include it as a separate file in your custom plugin.
 */

class PC4Y_MCP_Shipping {
    
    private $endpoint;
    private $public_key;
    private $secret;
    private $debug;
    
    public function __construct() {
        // Configuration - Update these for production
        $this->endpoint = 'https://api.pinecut4you.co.uk/instant-quote';
        $this->public_key = 'pc4y_pub_XXX';
        $this->secret = 'pc4y_sec_XXX';
        $this->debug = false;
    }
    
    /**
     * Calculate shipping using MCP API
     * 
     * @param array $package The shipping package
     * @return float|false The calculated rate or false on failure
     */
    public function calculate_shipping_rate($package = array()) {
        $items = $this->prepare_items_from_cart();
        
        if (empty($items)) {
            $this->log('No valid items found in cart');
            return false;
        }
        
        $destination = $this->prepare_destination();
        
        $payload = array(
            'cartId' => WC()->session->get_customer_id(),
            'destination' => $destination,
            'items' => $items,
            'preferences' => array(
                'speed' => 'cheapest',
                'allowSplit' => true
            )
        );
        
        return $this->call_mcp_api($payload);
    }
    
    /**
     * Prepare items from WooCommerce cart
     * 
     * @return array
     */
    private function prepare_items_from_cart() {
        $items = array();
        
        foreach (WC()->cart->get_cart() as $cart_item_key => $cart_item) {
            $product = $cart_item['data'];
            $product_id = $product->get_id();
            $name = $product->get_name();
            
            // Get dimensions from product_options (set by custom_weight_calculator plugin)
            $length = 0;
            $width = 0;
            
            if (isset($cart_item['product_options'])) {
                $length = (float) ($cart_item['product_options']['Length'] ?? 0);
                $width = (float) ($cart_item['product_options']['Width'] ?? 0);
            }
            
            // Get thickness from product meta
            $thickness = (float) get_post_meta($product_id, '_thickness', true);
            
            // Get calculated weight if available
            $weight = 0;
            if (isset($cart_item['calculated_weight'])) {
                $weight = (float) $cart_item['calculated_weight'];
            } elseif (isset($cart_item['Calculated Weight'])) {
                $weight = (float) $cart_item['Calculated Weight'];
            }
            
            // Get quantity
            $qty = (int) $cart_item['quantity'];
            
            // Only add item if we have valid dimensions
            if ($length > 0 && $width > 0 && $thickness > 0) {
                $items[] = array(
                    'sku' => $product->get_sku(),
                    'name' => $name,
                    'length_mm' => $length,
                    'width_mm' => $width,
                    'thickness_mm' => $thickness,
                    'weight_kg' => $weight,
                    'qty' => $qty
                );
                
                $this->log("Added item: $name - {$length}x{$width}x{$thickness}mm, {$weight}kg, qty: $qty");
            } else {
                $this->log("Skipped item due to missing dimensions: $name");
            }
        }
        
        return $items;
    }
    
    /**
     * Prepare destination from customer data
     * 
     * @return array
     */
    private function prepare_destination() {
        $country = WC()->customer->get_billing_country();
        $postcode = WC()->customer->get_billing_postcode();
        $city = WC()->customer->get_billing_city();
        
        // Use shipping address if available
        if (WC()->customer->get_shipping_country()) {
            $country = WC()->customer->get_shipping_country();
            $postcode = WC()->customer->get_shipping_postcode();
            $city = WC()->customer->get_shipping_city();
        }
        
        return array(
            'country' => $country ?: 'GB',
            'postalCode' => $postcode ?: '',
            'city' => $city ?: ''
        );
    }
    
    /**
     * Call MCP API with HMAC authentication
     * 
     * @param array $payload
     * @return float|false
     */
    private function call_mcp_api($payload) {
        $body = wp_json_encode($payload);
        $timestamp = (string) round(microtime(true) * 1000);
        $signature = hash_hmac('sha256', $timestamp . '.' . $body, $this->secret);
        
        $args = array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-PC4Y-Key' => $this->public_key,
                'X-PC4Y-Timestamp' => $timestamp,
                'X-PC4Y-Signature' => $signature
            ),
            'body' => $body,
            'timeout' => 8,
            'sslverify' => true
        );
        
        $this->log('Calling MCP API: ' . $this->endpoint);
        
        $response = wp_remote_post($this->endpoint, $args);
        
        if (is_wp_error($response)) {
            $this->log('API Error: ' . $response->get_error_message());
            return false;
        }
        
        $response_code = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);
        
        if ($response_code !== 200) {
            $this->log("API returned status $response_code: $response_body");
            return false;
        }
        
        $data = json_decode($response_body, true);
        
        if (!$data || !isset($data['total'])) {
            $this->log('Invalid API response: ' . $response_body);
            return false;
        }
        
        $this->log('API returned total: £' . $data['total']);
        
        // Store package info in session for order details
        if (isset($data['packages'])) {
            WC()->session->set('mcp_shipping_packages', $data['packages']);
        }
        
        return (float) $data['total'];
    }
    
    /**
     * Log debug messages
     * 
     * @param string $message
     */
    private function log($message) {
        if ($this->debug) {
            error_log('[PC4Y MCP Shipping] ' . $message);
        }
    }
}

/**
 * Integration with WooCommerce shipping method
 * Add this to your custom shipping method's calculate_shipping() function
 */
function pc4y_calculate_dynamic_shipping($package) {
    $mcp = new PC4Y_MCP_Shipping();
    $rate = $mcp->calculate_shipping_rate($package);
    
    if ($rate !== false) {
        // Dynamic rate from MCP API
        return array(
            'id' => 'pc4y_dynamic',
            'label' => __('Courier Delivery (best price found)', 'pc4y'),
            'cost' => $rate,
            'calc_tax' => 'per_order'
        );
    } else {
        // Fallback to flat rate if API fails
        return array(
            'id' => 'pc4y_fallback',
            'label' => __('Courier Delivery', 'pc4y'),
            'cost' => 35.00,
            'calc_tax' => 'per_order'
        );
    }
}

/**
 * Example integration in WooCommerce shipping method class
 */
/*
class WC_PC4Y_Shipping_Method extends WC_Shipping_Method {
    
    public function calculate_shipping($package = array()) {
        $rate_data = pc4y_calculate_dynamic_shipping($package);
        $this->add_rate($rate_data);
    }
}
*/