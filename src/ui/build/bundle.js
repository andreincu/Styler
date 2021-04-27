var ui = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function get_binding_group_value(group, __value, checked) {
        const value = new Set();
        for (let i = 0; i < group.length; i += 1) {
            if (group[i].checked)
                value.add(group[i].__value);
        }
        if (!checked) {
            value.delete(__value);
        }
        return Array.from(value);
    }
    function to_number(value) {
        return value === '' ? null : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    const defaultSettings = {
      addPrevToDescription: true,
      framesPerSection: 6,
      textsPerSection: 8,
      notificationTimeout: 6000,
      updateUsingLocalStyles: false,
      partialMatch: false,

      // stylers
      fillerPrefix: '',
      fillerSuffix: '',
      strokeerPrefix: '',
      strokeerSuffix: '-stroke',
      effecterPrefix: '',
      effecterSuffix: '',
      griderPrefix: '',
      griderSuffix: '',
      texterPrefix: '',
      texterSuffix: '',
    };

    var IconFrame = "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M7 22V17H2V15H7V9H2V7H7L7 2H9L9 7H15V2H17V7H22V9H17L17 15H22V17H17V22H15V17H9V22H7ZM15 15L15 9H9V15H15Z\" fill=\"#CFD9E5\" fill-opacity=\"0.95\"/>\n</svg>";

    var IconText = "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M3 3H4H12H20H21V4V9H19V5H13V19H15V21H12H9V19H11V5H5V9H3V4V3Z\" fill=\"#CFD9E5\"/>\n</svg>";

    var Warning = "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M12.9846 3.58065C12.547 2.80645 11.453 2.80645 11.0154 3.58064L2.15401 19.2581C1.71641 20.0323 2.26341 21 3.13861 21H20.8614C21.7366 21 22.2836 20.0323 21.846 19.2581L12.9846 3.58065ZM12 19C12.5523 19 13 18.5523 13 18V17.9C13 17.3477 12.5523 16.9 12 16.9C11.4477 16.9 11 17.3477 11 17.9V18C11 18.5523 11.4477 19 12 19ZM13 7V15H11V7H13Z\" fill=\"#CFD9E5\" fill-opacity=\"0.95\"/>\n</svg>";

    /* src/ui/components/Icon.svelte generated by Svelte v3.37.0 */

    function create_fragment$4(ctx) {
    	let i;
    	let i_class_value;

    	return {
    		c() {
    			i = element("i");
    			attr(i, "class", i_class_value = "svg-icon " + /*className*/ ctx[0] + " svelte-fcu417");
    		},
    		m(target, anchor) {
    			insert(target, i, anchor);
    			i.innerHTML = /*iconName*/ ctx[1];
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*iconName*/ 2) i.innerHTML = /*iconName*/ ctx[1];
    			if (dirty & /*className*/ 1 && i_class_value !== (i_class_value = "svg-icon " + /*className*/ ctx[0] + " svelte-fcu417")) {
    				attr(i, "class", i_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(i);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { class: className = "" } = $$props;
    	let { iconName = null } = $$props;

    	$$self.$$set = $$props => {
    		if ("class" in $$props) $$invalidate(0, className = $$props.class);
    		if ("iconName" in $$props) $$invalidate(1, iconName = $$props.iconName);
    	};

    	return [className, iconName];
    }

    class Icon extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { class: 0, iconName: 1 });
    	}
    }

    var Checkmark = "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M17.7643 8.64487L11.858 15.6449L11.1631 16.4685L10.3936 15.714L7.2999 12.6807L8.7001 11.2526L11.0244 13.5315L16.2357 7.35513L17.7643 8.64487Z\" fill=\"#CFD9E5\" fill-opacity=\"0.95\"/>\n</svg>";

    /* src/ui/components/Checkbox.svelte generated by Svelte v3.37.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[9] = list[i];
    	return child_ctx;
    }

    const get_helper_slot_changes = dirty => ({});
    const get_helper_slot_context = ctx => ({});
    const get_label_slot_changes = dirty => ({});
    const get_label_slot_context = ctx => ({});

    // (145:8) {:else}
    function create_else_block(ctx) {
    	let t_value = /*checkbox*/ ctx[9].value + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*checkboxes*/ 8 && t_value !== (t_value = /*checkbox*/ ctx[9].value + "")) set_data(t, t_value);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (143:8) {#if checkboxes.length === 1}
    function create_if_block(ctx) {
    	let current;
    	const label_slot_template = /*#slots*/ ctx[6].label;
    	const label_slot = create_slot(label_slot_template, ctx, /*$$scope*/ ctx[5], get_label_slot_context);

    	return {
    		c() {
    			if (label_slot) label_slot.c();
    		},
    		m(target, anchor) {
    			if (label_slot) {
    				label_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (label_slot) {
    				if (label_slot.p && dirty & /*$$scope*/ 32) {
    					update_slot(label_slot, label_slot_template, ctx, /*$$scope*/ ctx[5], dirty, get_label_slot_changes, get_label_slot_context);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (label_slot) label_slot.d(detaching);
    		}
    	};
    }

    // (131:0) {#each checkboxes as checkbox}
    function create_each_block(ctx) {
    	let label;
    	let input;
    	let input_value_value;
    	let t0;
    	let div1;
    	let div0;
    	let icon0;
    	let t1;
    	let div3;
    	let span;
    	let current_block_type_index;
    	let if_block;
    	let t2;
    	let div2;
    	let icon1;
    	let t3;
    	let div4;
    	let t4;
    	let current;
    	let mounted;
    	let dispose;

    	icon0 = new Icon({
    			props: {
    				iconName: /*iconName*/ ctx[2],
    				class: "icon-color"
    			}
    		});

    	const if_block_creators = [create_if_block, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*checkboxes*/ ctx[3].length === 1) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	icon1 = new Icon({ props: { iconName: Warning } });
    	const helper_slot_template = /*#slots*/ ctx[6].helper;
    	const helper_slot = create_slot(helper_slot_template, ctx, /*$$scope*/ ctx[5], get_helper_slot_context);

    	return {
    		c() {
    			label = element("label");
    			input = element("input");
    			t0 = space();
    			div1 = element("div");
    			div0 = element("div");
    			create_component(icon0.$$.fragment);
    			t1 = space();
    			div3 = element("div");
    			span = element("span");
    			if_block.c();
    			t2 = space();
    			div2 = element("div");
    			create_component(icon1.$$.fragment);
    			t3 = space();
    			div4 = element("div");
    			if (helper_slot) helper_slot.c();
    			t4 = space();
    			attr(input, "type", "checkbox");
    			input.__value = input_value_value = /*checkbox*/ ctx[9].value;
    			input.value = input.__value;
    			attr(input, "class", "svelte-15sa3m");
    			/*$$binding_groups*/ ctx[8][0].push(input);
    			attr(div0, "class", "checkbox-icon svelte-15sa3m");
    			attr(div1, "class", "checkbox-toggle svelte-15sa3m");
    			attr(div2, "class", "icon-helper svelte-15sa3m");
    			toggle_class(div2, "show", /*show*/ ctx[4]);
    			attr(div3, "class", "label svelte-15sa3m");
    			attr(div4, "class", "helper svelte-15sa3m");
    			attr(label, "class", "svelte-15sa3m");
    		},
    		m(target, anchor) {
    			insert(target, label, anchor);
    			append(label, input);
    			input.checked = ~/*group*/ ctx[1].indexOf(input.__value);
    			input.checked = /*checked*/ ctx[0];
    			append(label, t0);
    			append(label, div1);
    			append(div1, div0);
    			mount_component(icon0, div0, null);
    			append(label, t1);
    			append(label, div3);
    			append(div3, span);
    			if_blocks[current_block_type_index].m(span, null);
    			append(div3, t2);
    			append(div3, div2);
    			mount_component(icon1, div2, null);
    			append(label, t3);
    			append(label, div4);

    			if (helper_slot) {
    				helper_slot.m(div4, null);
    			}

    			append(label, t4);
    			current = true;

    			if (!mounted) {
    				dispose = listen(input, "change", /*input_change_handler*/ ctx[7]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (!current || dirty & /*checkboxes*/ 8 && input_value_value !== (input_value_value = /*checkbox*/ ctx[9].value)) {
    				input.__value = input_value_value;
    				input.value = input.__value;
    			}

    			if (dirty & /*group*/ 2) {
    				input.checked = ~/*group*/ ctx[1].indexOf(input.__value);
    			}

    			if (dirty & /*checked*/ 1) {
    				input.checked = /*checked*/ ctx[0];
    			}

    			const icon0_changes = {};
    			if (dirty & /*iconName*/ 4) icon0_changes.iconName = /*iconName*/ ctx[2];
    			icon0.$set(icon0_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(span, null);
    			}

    			if (dirty & /*show*/ 16) {
    				toggle_class(div2, "show", /*show*/ ctx[4]);
    			}

    			if (helper_slot) {
    				if (helper_slot.p && dirty & /*$$scope*/ 32) {
    					update_slot(helper_slot, helper_slot_template, ctx, /*$$scope*/ ctx[5], dirty, get_helper_slot_changes, get_helper_slot_context);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(icon0.$$.fragment, local);
    			transition_in(if_block);
    			transition_in(icon1.$$.fragment, local);
    			transition_in(helper_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(icon0.$$.fragment, local);
    			transition_out(if_block);
    			transition_out(icon1.$$.fragment, local);
    			transition_out(helper_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(label);
    			/*$$binding_groups*/ ctx[8][0].splice(/*$$binding_groups*/ ctx[8][0].indexOf(input), 1);
    			destroy_component(icon0);
    			if_blocks[current_block_type_index].d();
    			destroy_component(icon1);
    			if (helper_slot) helper_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*checkboxes*/ ctx[3];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*$$scope, show, Warning, checkboxes, iconName, group, checked*/ 63) {
    				each_value = /*checkboxes*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { iconName = Checkmark } = $$props;
    	let { checked = false } = $$props;
    	let { checkboxes = [{ value: "" }] } = $$props;
    	let { group = [] } = $$props;
    	let { show = false } = $$props;
    	const $$binding_groups = [[]];

    	function input_change_handler() {
    		group = get_binding_group_value($$binding_groups[0], this.__value, this.checked);
    		checked = this.checked;
    		$$invalidate(1, group);
    		$$invalidate(0, checked);
    	}

    	$$self.$$set = $$props => {
    		if ("iconName" in $$props) $$invalidate(2, iconName = $$props.iconName);
    		if ("checked" in $$props) $$invalidate(0, checked = $$props.checked);
    		if ("checkboxes" in $$props) $$invalidate(3, checkboxes = $$props.checkboxes);
    		if ("group" in $$props) $$invalidate(1, group = $$props.group);
    		if ("show" in $$props) $$invalidate(4, show = $$props.show);
    		if ("$$scope" in $$props) $$invalidate(5, $$scope = $$props.$$scope);
    	};

    	return [
    		checked,
    		group,
    		iconName,
    		checkboxes,
    		show,
    		$$scope,
    		slots,
    		input_change_handler,
    		$$binding_groups
    	];
    }

    class Checkbox extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			iconName: 2,
    			checked: 0,
    			checkboxes: 3,
    			group: 1,
    			show: 4
    		});
    	}
    }

    /* src/ui/components/Button.svelte generated by Svelte v3.37.0 */

    function create_fragment$2(ctx) {
    	let button;
    	let button_class_value;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);

    	return {
    		c() {
    			button = element("button");
    			if (default_slot) default_slot.c();
    			attr(button, "onclick", "this.blur();");
    			attr(button, "variant", /*variant*/ ctx[0]);
    			button.disabled = /*disabled*/ ctx[1];
    			attr(button, "class", button_class_value = "" + (/*variant*/ ctx[0] + " " + /*className*/ ctx[3] + " svelte-11r32x"));
    			toggle_class(button, "destructive", /*destructive*/ ctx[2]);
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(button, "click", /*click_handler*/ ctx[6]),
    					listen(button, "submit", /*submit_handler*/ ctx[7])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[4], dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*variant*/ 1) {
    				attr(button, "variant", /*variant*/ ctx[0]);
    			}

    			if (!current || dirty & /*disabled*/ 2) {
    				button.disabled = /*disabled*/ ctx[1];
    			}

    			if (!current || dirty & /*variant, className*/ 9 && button_class_value !== (button_class_value = "" + (/*variant*/ ctx[0] + " " + /*className*/ ctx[3] + " svelte-11r32x"))) {
    				attr(button, "class", button_class_value);
    			}

    			if (dirty & /*variant, className, destructive*/ 13) {
    				toggle_class(button, "destructive", /*destructive*/ ctx[2]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { variant = "primary" } = $$props;
    	let { disabled = false } = $$props;
    	let { destructive = false } = $$props;
    	let { class: className = "" } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	function submit_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ("variant" in $$props) $$invalidate(0, variant = $$props.variant);
    		if ("disabled" in $$props) $$invalidate(1, disabled = $$props.disabled);
    		if ("destructive" in $$props) $$invalidate(2, destructive = $$props.destructive);
    		if ("class" in $$props) $$invalidate(3, className = $$props.class);
    		if ("$$scope" in $$props) $$invalidate(4, $$scope = $$props.$$scope);
    	};

    	return [
    		variant,
    		disabled,
    		destructive,
    		className,
    		$$scope,
    		slots,
    		click_handler,
    		submit_handler
    	];
    }

    class Button extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			variant: 0,
    			disabled: 1,
    			destructive: 2,
    			class: 3
    		});
    	}
    }

    var NotificationTimeout = "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM13 11.4227V5H11V11.9941L11 12V12.01C11 12.4277 11.2561 12.7856 11.6198 12.9352L17.5622 16.366L18.5622 14.634L13 11.4227Z\" fill=\"#CFD9E5\" fill-opacity=\"0.95\"/>\n</svg>";

    /* src/ui/components/NumberField.svelte generated by Svelte v3.37.0 */
    const get_unit_measure_slot_changes = dirty => ({});
    const get_unit_measure_slot_context = ctx => ({});
    const get_textfield_label_slot_changes = dirty => ({});
    const get_textfield_label_slot_context = ctx => ({});

    function create_fragment$1(ctx) {
    	let label;
    	let div2;
    	let div0;
    	let icon;
    	let t0;
    	let div1;
    	let t1;
    	let div4;
    	let input;
    	let t2;
    	let div3;
    	let current;
    	let mounted;
    	let dispose;
    	icon = new Icon({ props: { iconName: /*iconName*/ ctx[1] } });
    	const textfield_label_slot_template = /*#slots*/ ctx[5]["textfield-label"];
    	const textfield_label_slot = create_slot(textfield_label_slot_template, ctx, /*$$scope*/ ctx[4], get_textfield_label_slot_context);
    	const unit_measure_slot_template = /*#slots*/ ctx[5]["unit-measure"];
    	const unit_measure_slot = create_slot(unit_measure_slot_template, ctx, /*$$scope*/ ctx[4], get_unit_measure_slot_context);

    	return {
    		c() {
    			label = element("label");
    			div2 = element("div");
    			div0 = element("div");
    			create_component(icon.$$.fragment);
    			t0 = space();
    			div1 = element("div");
    			if (textfield_label_slot) textfield_label_slot.c();
    			t1 = space();
    			div4 = element("div");
    			input = element("input");
    			t2 = space();
    			div3 = element("div");
    			if (unit_measure_slot) unit_measure_slot.c();
    			attr(div0, "class", "icon-container svelte-1f5p3kb");
    			attr(div1, "class", "label svelte-1f5p3kb");
    			attr(div2, "class", "left-side svelte-1f5p3kb");
    			attr(input, "type", "number");
    			attr(input, "placeholder", /*placeholder*/ ctx[2]);
    			attr(input, "step", /*step*/ ctx[3]);
    			attr(input, "class", "svelte-1f5p3kb");
    			attr(div3, "class", "unit-measure svelte-1f5p3kb");
    			attr(div4, "class", "right-side svelte-1f5p3kb");
    			attr(label, "class", "svelte-1f5p3kb");
    		},
    		m(target, anchor) {
    			insert(target, label, anchor);
    			append(label, div2);
    			append(div2, div0);
    			mount_component(icon, div0, null);
    			append(div2, t0);
    			append(div2, div1);

    			if (textfield_label_slot) {
    				textfield_label_slot.m(div1, null);
    			}

    			append(label, t1);
    			append(label, div4);
    			append(div4, input);
    			set_input_value(input, /*value*/ ctx[0]);
    			append(div4, t2);
    			append(div4, div3);

    			if (unit_measure_slot) {
    				unit_measure_slot.m(div3, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(input, "input", /*input_input_handler*/ ctx[6]),
    					listen(input, "click", click_handler)
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			const icon_changes = {};
    			if (dirty & /*iconName*/ 2) icon_changes.iconName = /*iconName*/ ctx[1];
    			icon.$set(icon_changes);

    			if (textfield_label_slot) {
    				if (textfield_label_slot.p && dirty & /*$$scope*/ 16) {
    					update_slot(textfield_label_slot, textfield_label_slot_template, ctx, /*$$scope*/ ctx[4], dirty, get_textfield_label_slot_changes, get_textfield_label_slot_context);
    				}
    			}

    			if (!current || dirty & /*placeholder*/ 4) {
    				attr(input, "placeholder", /*placeholder*/ ctx[2]);
    			}

    			if (!current || dirty & /*step*/ 8) {
    				attr(input, "step", /*step*/ ctx[3]);
    			}

    			if (dirty & /*value*/ 1 && to_number(input.value) !== /*value*/ ctx[0]) {
    				set_input_value(input, /*value*/ ctx[0]);
    			}

    			if (unit_measure_slot) {
    				if (unit_measure_slot.p && dirty & /*$$scope*/ 16) {
    					update_slot(unit_measure_slot, unit_measure_slot_template, ctx, /*$$scope*/ ctx[4], dirty, get_unit_measure_slot_changes, get_unit_measure_slot_context);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(icon.$$.fragment, local);
    			transition_in(textfield_label_slot, local);
    			transition_in(unit_measure_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(icon.$$.fragment, local);
    			transition_out(textfield_label_slot, local);
    			transition_out(unit_measure_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(label);
    			destroy_component(icon);
    			if (textfield_label_slot) textfield_label_slot.d(detaching);
    			if (unit_measure_slot) unit_measure_slot.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    const click_handler = event => event.currentTarget.select();

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { iconName = NotificationTimeout } = $$props;
    	let { value = "" } = $$props;
    	let { placeholder = "" } = $$props;
    	let { step = 1 } = $$props;

    	function input_input_handler() {
    		value = to_number(this.value);
    		$$invalidate(0, value);
    	}

    	$$self.$$set = $$props => {
    		if ("iconName" in $$props) $$invalidate(1, iconName = $$props.iconName);
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    		if ("placeholder" in $$props) $$invalidate(2, placeholder = $$props.placeholder);
    		if ("step" in $$props) $$invalidate(3, step = $$props.step);
    		if ("$$scope" in $$props) $$invalidate(4, $$scope = $$props.$$scope);
    	};

    	return [value, iconName, placeholder, step, $$scope, slots, input_input_handler];
    }

    class NumberField extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			iconName: 1,
    			value: 0,
    			placeholder: 2,
    			step: 3
    		});
    	}
    }

    /* src/ui/App.svelte generated by Svelte v3.37.0 */

    const { window: window_1 } = globals;

    function create_textfield_label_slot_2(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Notification duration";
    			attr(span, "slot", "textfield-label");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (110:6) 
    function create_unit_measure_slot_2(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "ms";
    			attr(span, "slot", "unit-measure");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (117:6) 
    function create_label_slot_2(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Show last style in description";
    			attr(span, "slot", "label");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (121:6) 
    function create_label_slot_1(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Update using local styles";
    			attr(span, "slot", "label");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (125:6) 
    function create_label_slot(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Extend name match";
    			attr(span, "slot", "label");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (142:6) 
    function create_textfield_label_slot_1(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Texts per column";
    			attr(span, "slot", "textfield-label");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (143:6) 
    function create_unit_measure_slot_1(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "layers";
    			attr(span, "slot", "unit-measure");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (147:6) 
    function create_textfield_label_slot(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Frames per row";
    			attr(span, "slot", "textfield-label");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (148:6) 
    function create_unit_measure_slot(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "layers";
    			attr(span, "slot", "unit-measure");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (154:2) <Button on:click={resetToDefault} variant="secondary" class="col">
    function create_default_slot_1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Reset to default");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (155:2) <Button on:click={saveSettings} class="col">
    function create_default_slot(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Save settings");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let main;
    	let div0;
    	let h20;
    	let t1;
    	let numberfield0;
    	let updating_value;
    	let t2;
    	let div2;
    	let h21;
    	let t4;
    	let checkbox0;
    	let updating_checked;
    	let t5;
    	let checkbox1;
    	let updating_checked_1;
    	let t6;
    	let checkbox2;
    	let updating_checked_2;
    	let t7;
    	let div1;
    	let icon;
    	let t8;
    	let span;
    	let t11;
    	let div3;
    	let h22;
    	let t13;
    	let numberfield1;
    	let updating_value_1;
    	let t14;
    	let numberfield2;
    	let updating_value_2;
    	let t15;
    	let footer;
    	let button0;
    	let t16;
    	let button1;
    	let current;
    	let mounted;
    	let dispose;

    	function numberfield0_value_binding(value) {
    		/*numberfield0_value_binding*/ ctx[4](value);
    	}

    	let numberfield0_props = {
    		step: "1000",
    		$$slots: {
    			"unit-measure": [create_unit_measure_slot_2],
    			"textfield-label": [create_textfield_label_slot_2]
    		},
    		$$scope: { ctx }
    	};

    	if (/*uiSettings*/ ctx[0].notificationTimeout !== void 0) {
    		numberfield0_props.value = /*uiSettings*/ ctx[0].notificationTimeout;
    	}

    	numberfield0 = new NumberField({ props: numberfield0_props });
    	binding_callbacks.push(() => bind(numberfield0, "value", numberfield0_value_binding));

    	function checkbox0_checked_binding(value) {
    		/*checkbox0_checked_binding*/ ctx[5](value);
    	}

    	let checkbox0_props = {
    		$$slots: { label: [create_label_slot_2] },
    		$$scope: { ctx }
    	};

    	if (/*uiSettings*/ ctx[0].addPrevToDescription !== void 0) {
    		checkbox0_props.checked = /*uiSettings*/ ctx[0].addPrevToDescription;
    	}

    	checkbox0 = new Checkbox({ props: checkbox0_props });
    	binding_callbacks.push(() => bind(checkbox0, "checked", checkbox0_checked_binding));

    	function checkbox1_checked_binding(value) {
    		/*checkbox1_checked_binding*/ ctx[6](value);
    	}

    	let checkbox1_props = {
    		show: true,
    		$$slots: { label: [create_label_slot_1] },
    		$$scope: { ctx }
    	};

    	if (/*uiSettings*/ ctx[0].updateUsingLocalStyles !== void 0) {
    		checkbox1_props.checked = /*uiSettings*/ ctx[0].updateUsingLocalStyles;
    	}

    	checkbox1 = new Checkbox({ props: checkbox1_props });
    	binding_callbacks.push(() => bind(checkbox1, "checked", checkbox1_checked_binding));

    	function checkbox2_checked_binding(value) {
    		/*checkbox2_checked_binding*/ ctx[7](value);
    	}

    	let checkbox2_props = {
    		show: true,
    		$$slots: { label: [create_label_slot] },
    		$$scope: { ctx }
    	};

    	if (/*uiSettings*/ ctx[0].partialMatch !== void 0) {
    		checkbox2_props.checked = /*uiSettings*/ ctx[0].partialMatch;
    	}

    	checkbox2 = new Checkbox({ props: checkbox2_props });
    	binding_callbacks.push(() => bind(checkbox2, "checked", checkbox2_checked_binding));

    	icon = new Icon({
    			props: {
    				iconName: Warning,
    				class: "icon-container"
    			}
    		});

    	function numberfield1_value_binding(value) {
    		/*numberfield1_value_binding*/ ctx[8](value);
    	}

    	let numberfield1_props = {
    		iconName: IconText,
    		$$slots: {
    			"unit-measure": [create_unit_measure_slot_1],
    			"textfield-label": [create_textfield_label_slot_1]
    		},
    		$$scope: { ctx }
    	};

    	if (/*uiSettings*/ ctx[0].textsPerSection !== void 0) {
    		numberfield1_props.value = /*uiSettings*/ ctx[0].textsPerSection;
    	}

    	numberfield1 = new NumberField({ props: numberfield1_props });
    	binding_callbacks.push(() => bind(numberfield1, "value", numberfield1_value_binding));

    	function numberfield2_value_binding(value) {
    		/*numberfield2_value_binding*/ ctx[9](value);
    	}

    	let numberfield2_props = {
    		iconName: IconFrame,
    		$$slots: {
    			"unit-measure": [create_unit_measure_slot],
    			"textfield-label": [create_textfield_label_slot]
    		},
    		$$scope: { ctx }
    	};

    	if (/*uiSettings*/ ctx[0].framesPerSection !== void 0) {
    		numberfield2_props.value = /*uiSettings*/ ctx[0].framesPerSection;
    	}

    	numberfield2 = new NumberField({ props: numberfield2_props });
    	binding_callbacks.push(() => bind(numberfield2, "value", numberfield2_value_binding));

    	button0 = new Button({
    			props: {
    				variant: "secondary",
    				class: "col",
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			}
    		});

    	button0.$on("click", /*resetToDefault*/ ctx[2]);

    	button1 = new Button({
    			props: {
    				class: "col",
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	button1.$on("click", /*saveSettings*/ ctx[1]);

    	return {
    		c() {
    			main = element("main");
    			div0 = element("div");
    			h20 = element("h2");
    			h20.textContent = "General";
    			t1 = space();
    			create_component(numberfield0.$$.fragment);
    			t2 = space();
    			div2 = element("div");
    			h21 = element("h2");
    			h21.textContent = "Generate styles";
    			t4 = space();
    			create_component(checkbox0.$$.fragment);
    			t5 = space();
    			create_component(checkbox1.$$.fragment);
    			t6 = space();
    			create_component(checkbox2.$$.fragment);
    			t7 = space();
    			div1 = element("div");
    			create_component(icon.$$.fragment);
    			t8 = space();
    			span = element("span");

    			span.innerHTML = `Experimental features!
        <br/>
        Sometimes, produces unexpected results...`;

    			t11 = space();
    			div3 = element("div");
    			h22 = element("h2");
    			h22.textContent = "Extract Styles";
    			t13 = space();
    			create_component(numberfield1.$$.fragment);
    			t14 = space();
    			create_component(numberfield2.$$.fragment);
    			t15 = space();
    			footer = element("footer");
    			create_component(button0.$$.fragment);
    			t16 = space();
    			create_component(button1.$$.fragment);
    			attr(h20, "class", "caption");
    			attr(div0, "class", "svelte-4b1p9u");
    			attr(h21, "class", "caption");
    			attr(span, "class", "small svelte-4b1p9u");
    			attr(div1, "class", "helper svelte-4b1p9u");
    			attr(div2, "class", "svelte-4b1p9u");
    			attr(h22, "class", "caption");
    			attr(div3, "class", "svelte-4b1p9u");
    			attr(main, "class", "svelte-4b1p9u");
    			attr(footer, "class", "svelte-4b1p9u");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, div0);
    			append(div0, h20);
    			append(div0, t1);
    			mount_component(numberfield0, div0, null);
    			append(main, t2);
    			append(main, div2);
    			append(div2, h21);
    			append(div2, t4);
    			mount_component(checkbox0, div2, null);
    			append(div2, t5);
    			mount_component(checkbox1, div2, null);
    			append(div2, t6);
    			mount_component(checkbox2, div2, null);
    			append(div2, t7);
    			append(div2, div1);
    			mount_component(icon, div1, null);
    			append(div1, t8);
    			append(div1, span);
    			append(main, t11);
    			append(main, div3);
    			append(div3, h22);
    			append(div3, t13);
    			mount_component(numberfield1, div3, null);
    			append(div3, t14);
    			mount_component(numberfield2, div3, null);
    			insert(target, t15, anchor);
    			insert(target, footer, anchor);
    			mount_component(button0, footer, null);
    			append(footer, t16);
    			mount_component(button1, footer, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(window_1, "keydown", /*cancelModalUsingEscape*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			const numberfield0_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				numberfield0_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value && dirty & /*uiSettings*/ 1) {
    				updating_value = true;
    				numberfield0_changes.value = /*uiSettings*/ ctx[0].notificationTimeout;
    				add_flush_callback(() => updating_value = false);
    			}

    			numberfield0.$set(numberfield0_changes);
    			const checkbox0_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				checkbox0_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_checked && dirty & /*uiSettings*/ 1) {
    				updating_checked = true;
    				checkbox0_changes.checked = /*uiSettings*/ ctx[0].addPrevToDescription;
    				add_flush_callback(() => updating_checked = false);
    			}

    			checkbox0.$set(checkbox0_changes);
    			const checkbox1_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				checkbox1_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_checked_1 && dirty & /*uiSettings*/ 1) {
    				updating_checked_1 = true;
    				checkbox1_changes.checked = /*uiSettings*/ ctx[0].updateUsingLocalStyles;
    				add_flush_callback(() => updating_checked_1 = false);
    			}

    			checkbox1.$set(checkbox1_changes);
    			const checkbox2_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				checkbox2_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_checked_2 && dirty & /*uiSettings*/ 1) {
    				updating_checked_2 = true;
    				checkbox2_changes.checked = /*uiSettings*/ ctx[0].partialMatch;
    				add_flush_callback(() => updating_checked_2 = false);
    			}

    			checkbox2.$set(checkbox2_changes);
    			const numberfield1_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				numberfield1_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value_1 && dirty & /*uiSettings*/ 1) {
    				updating_value_1 = true;
    				numberfield1_changes.value = /*uiSettings*/ ctx[0].textsPerSection;
    				add_flush_callback(() => updating_value_1 = false);
    			}

    			numberfield1.$set(numberfield1_changes);
    			const numberfield2_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				numberfield2_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value_2 && dirty & /*uiSettings*/ 1) {
    				updating_value_2 = true;
    				numberfield2_changes.value = /*uiSettings*/ ctx[0].framesPerSection;
    				add_flush_callback(() => updating_value_2 = false);
    			}

    			numberfield2.$set(numberfield2_changes);
    			const button0_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				button0_changes.$$scope = { dirty, ctx };
    			}

    			button0.$set(button0_changes);
    			const button1_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				button1_changes.$$scope = { dirty, ctx };
    			}

    			button1.$set(button1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(numberfield0.$$.fragment, local);
    			transition_in(checkbox0.$$.fragment, local);
    			transition_in(checkbox1.$$.fragment, local);
    			transition_in(checkbox2.$$.fragment, local);
    			transition_in(icon.$$.fragment, local);
    			transition_in(numberfield1.$$.fragment, local);
    			transition_in(numberfield2.$$.fragment, local);
    			transition_in(button0.$$.fragment, local);
    			transition_in(button1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(numberfield0.$$.fragment, local);
    			transition_out(checkbox0.$$.fragment, local);
    			transition_out(checkbox1.$$.fragment, local);
    			transition_out(checkbox2.$$.fragment, local);
    			transition_out(icon.$$.fragment, local);
    			transition_out(numberfield1.$$.fragment, local);
    			transition_out(numberfield2.$$.fragment, local);
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_component(numberfield0);
    			destroy_component(checkbox0);
    			destroy_component(checkbox1);
    			destroy_component(checkbox2);
    			destroy_component(icon);
    			destroy_component(numberfield1);
    			destroy_component(numberfield2);
    			if (detaching) detach(t15);
    			if (detaching) detach(footer);
    			destroy_component(button0);
    			destroy_component(button1);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
    		function adopt(value) {
    			return value instanceof P
    			? value
    			: new P(function (resolve) {
    						resolve(value);
    					});
    		}

    		return new (P || (P = Promise))(function (resolve, reject) {
    				function fulfilled(value) {
    					try {
    						step(generator.next(value));
    					} catch(e) {
    						reject(e);
    					}
    				}

    				function rejected(value) {
    					try {
    						step(generator["throw"](value));
    					} catch(e) {
    						reject(e);
    					}
    				}

    				function step(result) {
    					result.done
    					? resolve(result.value)
    					: adopt(result.value).then(fulfilled, rejected);
    				}

    				step((generator = generator.apply(thisArg, _arguments || [])).next());
    			});
    	};

    	let uiSettings = Object.assign({}, defaultSettings);

    	onMount(() => {
    		window.focus();
    	});

    	const updateSettings = (currentSettings, newSettings = defaultSettings) => {
    		Object.keys(newSettings).map(key => {
    			currentSettings[key] = newSettings[key];
    		});

    		return currentSettings;
    	};

    	onmessage = e => __awaiter(void 0, void 0, void 0, function* () {
    		const codeSettings = e.data.pluginMessage;

    		// console.log('in ui msg:');
    		// console.log(e.data.pluginMessage);
    		$$invalidate(0, uiSettings = updateSettings(uiSettings, codeSettings));
    	});

    	const saveSettings = () => {
    		const { fillerPrefix, fillerSuffix, strokeerPrefix, strokeerSuffix } = uiSettings;

    		if (fillerPrefix === strokeerPrefix && fillerSuffix === strokeerSuffix) ; else {
    			parent.postMessage(
    				{
    					pluginMessage: { type: "save-settings", uiSettings }
    				},
    				"*"
    			);
    		}
    	};

    	const resetToDefault = () => {
    		$$invalidate(0, uiSettings = updateSettings(uiSettings, defaultSettings));
    		return uiSettings;
    	};

    	const cancelModalUsingEscape = event => {
    		if (event.key === "Escape") {
    			parent.postMessage({ pluginMessage: { type: "cancel-modal" } }, "*");
    		}
    	};

    	function numberfield0_value_binding(value) {
    		if ($$self.$$.not_equal(uiSettings.notificationTimeout, value)) {
    			uiSettings.notificationTimeout = value;
    			$$invalidate(0, uiSettings);
    		}
    	}

    	function checkbox0_checked_binding(value) {
    		if ($$self.$$.not_equal(uiSettings.addPrevToDescription, value)) {
    			uiSettings.addPrevToDescription = value;
    			$$invalidate(0, uiSettings);
    		}
    	}

    	function checkbox1_checked_binding(value) {
    		if ($$self.$$.not_equal(uiSettings.updateUsingLocalStyles, value)) {
    			uiSettings.updateUsingLocalStyles = value;
    			$$invalidate(0, uiSettings);
    		}
    	}

    	function checkbox2_checked_binding(value) {
    		if ($$self.$$.not_equal(uiSettings.partialMatch, value)) {
    			uiSettings.partialMatch = value;
    			$$invalidate(0, uiSettings);
    		}
    	}

    	function numberfield1_value_binding(value) {
    		if ($$self.$$.not_equal(uiSettings.textsPerSection, value)) {
    			uiSettings.textsPerSection = value;
    			$$invalidate(0, uiSettings);
    		}
    	}

    	function numberfield2_value_binding(value) {
    		if ($$self.$$.not_equal(uiSettings.framesPerSection, value)) {
    			uiSettings.framesPerSection = value;
    			$$invalidate(0, uiSettings);
    		}
    	}

    	return [
    		uiSettings,
    		saveSettings,
    		resetToDefault,
    		cancelModalUsingEscape,
    		numberfield0_value_binding,
    		checkbox0_checked_binding,
    		checkbox1_checked_binding,
    		checkbox2_checked_binding,
    		numberfield1_value_binding,
    		numberfield2_value_binding
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body,
    });

    return app;

}());
